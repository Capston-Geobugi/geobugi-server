import { getDB, withTransaction } from '../database/db'
import { setCvSensitivity } from './cvController'
import { getCurrentRemoteUserId } from './profileController'

const MIN_USER_SENSITIVITY = 1
const MAX_USER_SENSITIVITY = 20
const MAX_MODE_NAME_LENGTH = 30

function clampUserSensitivity(value) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    throw new Error('Sensitivity must be a number.')
  }

  return Math.min(MAX_USER_SENSITIVITY, Math.max(MIN_USER_SENSITIVITY, Math.round(numericValue)))
}

function normalizeName(name) {
  const normalizedName = String(name ?? '').trim()

  if (!normalizedName) {
    throw new Error('Mode name is required.')
  }

  if (normalizedName.length > MAX_MODE_NAME_LENGTH) {
    throw new Error(`Mode name must be ${MAX_MODE_NAME_LENGTH} characters or fewer.`)
  }

  return normalizedName
}

function mapSensitivityMode(row) {
  if (!row) {
    return null
  }

  return {
    id: Number(row.id),
    remoteUserId: row.remote_user_id,
    name: row.name,
    userSensitivity: Number(row.user_sensitivity),
    isActive: Boolean(row.is_active),
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function ensureRemoteUserId() {
  const remoteUserId = getCurrentRemoteUserId()

  if (!remoteUserId) {
    throw new Error('로그인한 사용자 정보가 필요해요.')
  }

  return remoteUserId
}

function ensureDefaultMode(database, remoteUserId) {
  const count = database
    .prepare('SELECT COUNT(*) AS count FROM sensitivity_modes WHERE remote_user_id = ?')
    .get(remoteUserId).count

  if (count > 0) {
    return
  }

  database
    .prepare(
      `
        INSERT INTO sensitivity_modes (
          remote_user_id,
          name,
          user_sensitivity,
          is_active,
          is_default
        ) VALUES (?, '기본 모드', 10, 1, 1)
      `
    )
    .run(remoteUserId)
}

function getModeRow(modeId, remoteUserId = ensureRemoteUserId()) {
  const database = getDB()
  ensureDefaultMode(database, remoteUserId)

  return database
    .prepare('SELECT * FROM sensitivity_modes WHERE id = ? AND remote_user_id = ?')
    .get(modeId, remoteUserId)
}

export function getSensitivityModes() {
  const database = getDB()
  const remoteUserId = getCurrentRemoteUserId()

  if (!remoteUserId) {
    return []
  }

  ensureDefaultMode(database, remoteUserId)

  const rows = database
    .prepare(
      `
        SELECT *
        FROM sensitivity_modes
        WHERE remote_user_id = ?
        ORDER BY is_active DESC, is_default DESC, created_at ASC, id ASC
      `
    )
    .all(remoteUserId)

  return rows.map(mapSensitivityMode)
}

export function getActiveSensitivityMode() {
  const database = getDB()
  const remoteUserId = getCurrentRemoteUserId()

  if (!remoteUserId) {
    return null
  }

  ensureDefaultMode(database, remoteUserId)

  const row = database
    .prepare(
      `
        SELECT *
        FROM sensitivity_modes
        WHERE remote_user_id = ?
          AND is_active = 1
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `
    )
    .get(remoteUserId)

  return mapSensitivityMode(row)
}

const createSensitivityModeTransaction = withTransaction((input) => {
  const database = getDB()
  const remoteUserId = ensureRemoteUserId()
  const name = normalizeName(input?.name)
  const userSensitivity = clampUserSensitivity(input?.userSensitivity)
  const shouldActivate = Boolean(input?.activate)

  ensureDefaultMode(database, remoteUserId)

  if (shouldActivate) {
    database
      .prepare(
        `
          UPDATE sensitivity_modes
          SET is_active = 0
          WHERE remote_user_id = ?
            AND is_active = 1
        `
      )
      .run(remoteUserId)
  }

  const result = database
    .prepare(
      `
        INSERT INTO sensitivity_modes (
          remote_user_id,
          name,
          user_sensitivity,
          is_active
        ) VALUES (?, ?, ?, ?)
      `
    )
    .run(remoteUserId, name, userSensitivity, shouldActivate ? 1 : 0)

  const createdMode = mapSensitivityMode(getModeRow(result.lastInsertRowid, remoteUserId))

  if (shouldActivate) {
    setCvSensitivity(userSensitivity)
  }

  return createdMode
})

export function createSensitivityMode(input) {
  return createSensitivityModeTransaction(input ?? {})
}

const updateSensitivityModeTransaction = withTransaction((input) => {
  const database = getDB()
  const remoteUserId = ensureRemoteUserId()
  const modeId = Number(input?.id)
  const currentMode = getModeRow(modeId, remoteUserId)

  if (!currentMode) {
    throw new Error('Sensitivity mode not found.')
  }

  const name = input?.name === undefined ? currentMode.name : normalizeName(input.name)
  const userSensitivity =
    input?.userSensitivity === undefined
      ? Number(currentMode.user_sensitivity)
      : clampUserSensitivity(input.userSensitivity)

  database
    .prepare(
      `
        UPDATE sensitivity_modes
        SET name = ?,
            user_sensitivity = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND remote_user_id = ?
      `
    )
    .run(name, userSensitivity, modeId, remoteUserId)

  const updatedMode = mapSensitivityMode(getModeRow(modeId, remoteUserId))

  if (updatedMode.isActive) {
    setCvSensitivity(updatedMode.userSensitivity)
  }

  return updatedMode
})

export function updateSensitivityMode(input) {
  return updateSensitivityModeTransaction(input ?? {})
}

const activateSensitivityModeTransaction = withTransaction((input) => {
  const database = getDB()
  const remoteUserId = ensureRemoteUserId()
  const modeId = Number(input?.id)
  const currentMode = getModeRow(modeId, remoteUserId)

  if (!currentMode) {
    throw new Error('Sensitivity mode not found.')
  }

  database
    .prepare(
      `
        UPDATE sensitivity_modes
        SET is_active = 0
        WHERE remote_user_id = ?
          AND is_active = 1
      `
    )
    .run(remoteUserId)
  database
    .prepare(
      `
        UPDATE sensitivity_modes
        SET is_active = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND remote_user_id = ?
      `
    )
    .run(modeId, remoteUserId)

  const activeMode = mapSensitivityMode(getModeRow(modeId, remoteUserId))
  setCvSensitivity(activeMode.userSensitivity)

  return activeMode
})

export function activateSensitivityMode(input) {
  return activateSensitivityModeTransaction(input ?? {})
}

const deleteSensitivityModeTransaction = withTransaction((input) => {
  const database = getDB()
  const remoteUserId = ensureRemoteUserId()
  const modeId = Number(input?.id)
  const currentMode = getModeRow(modeId, remoteUserId)

  if (!currentMode) {
    throw new Error('Sensitivity mode not found.')
  }

  if (currentMode.is_default) {
    throw new Error('Default sensitivity mode cannot be deleted.')
  }

  const wasActive = Boolean(currentMode.is_active)

  database
    .prepare('DELETE FROM sensitivity_modes WHERE id = ? AND remote_user_id = ?')
    .run(modeId, remoteUserId)

  if (wasActive) {
    const fallbackMode = database
      .prepare(
        `
          SELECT *
          FROM sensitivity_modes
          WHERE remote_user_id = ?
          ORDER BY is_default DESC, created_at ASC, id ASC
          LIMIT 1
        `
      )
      .get(remoteUserId)

    if (fallbackMode) {
      database.prepare('UPDATE sensitivity_modes SET is_active = 1 WHERE id = ?').run(fallbackMode.id)
      setCvSensitivity(fallbackMode.user_sensitivity)
    }
  }

  return { ok: true }
})

export function deleteSensitivityMode(input) {
  return deleteSensitivityModeTransaction(input ?? {})
}
