import { getDB, withTransaction } from '../database/db'
import { getCurrentRemoteUserId } from './profileController'

function mapCalibration(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    remoteUserId: row.remote_user_id,
    shoulderSlope: row.shoulder_slope,
    neckForwardOffset: row.neck_forward_offset,
    earWidthRatio: row.ear_width_ratio,
    torsoTilt: row.torso_tilt,
    shoulderCenterY: row.shoulder_center_y,
    confidence: row.confidence,
    sampleCount: row.sample_count,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at
  }
}

export function startCalibration() {
  return { ok: true }
}

const saveCalibrationTransaction = withTransaction((input) => {
  const database = getDB()
  const remoteUserId = getCurrentRemoteUserId()

  if (!remoteUserId) {
    throw new Error('로그인한 사용자 정보가 필요해요.')
  }

  database
    .prepare('UPDATE calibrations SET is_active = 0 WHERE remote_user_id = ? AND is_active = 1')
    .run(remoteUserId)

  const result = database
    .prepare(
      `
        INSERT INTO calibrations (
          remote_user_id,
          shoulder_slope,
          neck_forward_offset,
          ear_width_ratio,
          torso_tilt,
          shoulder_center_y,
          confidence,
          sample_count,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `
    )
    .run(
      remoteUserId,
      input.shoulderSlope,
      input.neckForwardOffset,
      input.earWidthRatio ?? 0,
      input.torsoTilt,
      input.shoulderCenterY ?? null,
      input.confidence,
      input.sampleCount
    )

  const row = database.prepare('SELECT * FROM calibrations WHERE id = ?').get(result.lastInsertRowid)

  return mapCalibration(row)
})

export function saveCalibration(input) {
  return saveCalibrationTransaction(input)
}

export function getActiveCalibration() {
  const database = getDB()
  const remoteUserId = getCurrentRemoteUserId()

  if (!remoteUserId) {
    return null
  }

  const row = database
    .prepare(
      `
        SELECT *
        FROM calibrations
        WHERE remote_user_id = ?
          AND is_active = 1
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `
    )
    .get(remoteUserId)

  return mapCalibration(row)
}
