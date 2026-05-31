import { getDB, withTransaction } from '../database/db'

const PROFILE_ID = 1
const MAX_DISPLAY_NAME_LENGTH = 30
const SUPABASE_USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function mapProfile(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    displayName: row.display_name,
    remoteUserId: row.remote_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function normalizeDisplayName(displayName) {
  const normalizedDisplayName = String(displayName ?? '').trim()

  if (!normalizedDisplayName) {
    throw new Error('Display name is required.')
  }

  if (normalizedDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`)
  }

  return normalizedDisplayName
}

function normalizeRemoteUserId(remoteUserId) {
  const normalizedRemoteUserId = String(remoteUserId ?? '').trim()

  if (!normalizedRemoteUserId) {
    throw new Error('Remote user id is required.')
  }

  if (!SUPABASE_USER_ID_PATTERN.test(normalizedRemoteUserId)) {
    throw new Error('Remote user id must be a valid Supabase user UUID.')
  }

  return normalizedRemoteUserId
}

function ensureProfileRow(database) {
  database
    .prepare(
      `
        INSERT OR IGNORE INTO user_profile (id)
        VALUES (?)
      `
    )
    .run(PROFILE_ID)
}

export function getProfile() {
  const database = getDB()
  ensureProfileRow(database)

  const row = database.prepare('SELECT * FROM user_profile WHERE id = ?').get(PROFILE_ID)

  return mapProfile(row)
}

const updateProfileTransaction = withTransaction((input) => {
  const database = getDB()
  const displayName = normalizeDisplayName(input?.displayName)

  ensureProfileRow(database)

  database
    .prepare(
      `
        UPDATE user_profile
        SET display_name = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .run(displayName, PROFILE_ID)

  return getProfile()
})

export function updateProfile(input) {
  return updateProfileTransaction(input ?? {})
}

const linkRemoteUserTransaction = withTransaction((input) => {
  const database = getDB()
  const remoteUserId = normalizeRemoteUserId(input?.remoteUserId)

  ensureProfileRow(database)

  database
    .prepare(
      `
        UPDATE user_profile
        SET remote_user_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .run(remoteUserId, PROFILE_ID)

  return getProfile()
})

export function linkRemoteUser(input) {
  return linkRemoteUserTransaction(input ?? {})
}

const unlinkRemoteUserTransaction = withTransaction(() => {
  const database = getDB()

  ensureProfileRow(database)

  database
    .prepare(
      `
        UPDATE user_profile
        SET remote_user_id = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    )
    .run(PROFILE_ID)

  return getProfile()
})

export function unlinkRemoteUser() {
  return unlinkRemoteUserTransaction()
}
