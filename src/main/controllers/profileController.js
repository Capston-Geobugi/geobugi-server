import { getDB, withTransaction } from '../database/db'

const PROFILE_ID = 1
const MAX_DISPLAY_NAME_LENGTH = 30

function mapProfile(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    displayName: row.display_name,
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
