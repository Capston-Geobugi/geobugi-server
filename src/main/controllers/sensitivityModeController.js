import { getDB, withTransaction } from '../database/db'
import { setCvSensitivity } from './cvController'

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
    name: row.name,
    userSensitivity: Number(row.user_sensitivity),
    isActive: Boolean(row.is_active),
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function getModeRow(modeId) {
  const database = getDB()
  return database.prepare('SELECT * FROM sensitivity_modes WHERE id = ?').get(modeId)
}

export function getSensitivityModes() {
  const database = getDB()
  const rows = database
    .prepare(
      `
        SELECT *
        FROM sensitivity_modes
        ORDER BY is_active DESC, is_default DESC, created_at ASC, id ASC
      `
    )
    .all()

  return rows.map(mapSensitivityMode)
}

export function getActiveSensitivityMode() {
  const database = getDB()
  const row = database
    .prepare(
      `
        SELECT *
        FROM sensitivity_modes
        WHERE is_active = 1
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `
    )
    .get()

  return mapSensitivityMode(row)
}

const createSensitivityModeTransaction = withTransaction((input) => {
  const database = getDB()
  const name = normalizeName(input?.name)
  const userSensitivity = clampUserSensitivity(input?.userSensitivity)
  const shouldActivate = Boolean(input?.activate)

  if (shouldActivate) {
    database.prepare('UPDATE sensitivity_modes SET is_active = 0 WHERE is_active = 1').run()
  }

  const result = database
    .prepare(
      `
        INSERT INTO sensitivity_modes (
          name,
          user_sensitivity,
          is_active
        ) VALUES (?, ?, ?)
      `
    )
    .run(name, userSensitivity, shouldActivate ? 1 : 0)

  const createdMode = mapSensitivityMode(getModeRow(result.lastInsertRowid))

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
  const modeId = Number(input?.id)
  const currentMode = getModeRow(modeId)

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
      `
    )
    .run(name, userSensitivity, modeId)

  const updatedMode = mapSensitivityMode(getModeRow(modeId))

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
  const modeId = Number(input?.id)
  const currentMode = getModeRow(modeId)

  if (!currentMode) {
    throw new Error('Sensitivity mode not found.')
  }

  database.prepare('UPDATE sensitivity_modes SET is_active = 0 WHERE is_active = 1').run()
  database
    .prepare(
      `
        UPDATE sensitivity_modes
        SET is_active = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .run(modeId)

  const activeMode = mapSensitivityMode(getModeRow(modeId))
  setCvSensitivity(activeMode.userSensitivity)

  return activeMode
})

export function activateSensitivityMode(input) {
  return activateSensitivityModeTransaction(input ?? {})
}

const deleteSensitivityModeTransaction = withTransaction((input) => {
  const database = getDB()
  const modeId = Number(input?.id)
  const currentMode = getModeRow(modeId)

  if (!currentMode) {
    throw new Error('Sensitivity mode not found.')
  }

  if (currentMode.is_default) {
    throw new Error('Default sensitivity mode cannot be deleted.')
  }

  const wasActive = Boolean(currentMode.is_active)

  database.prepare('DELETE FROM sensitivity_modes WHERE id = ?').run(modeId)

  if (wasActive) {
    const fallbackMode = database
      .prepare(
        `
          SELECT *
          FROM sensitivity_modes
          ORDER BY is_default DESC, created_at ASC, id ASC
          LIMIT 1
        `
      )
      .get()

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
