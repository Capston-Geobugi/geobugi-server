import { getDB, withTransaction } from '../database/db'

function mapCalibration(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
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

  database.prepare('UPDATE calibrations SET is_active = 0 WHERE is_active = 1').run()

  const result = database
    .prepare(
      `
        INSERT INTO calibrations (
          shoulder_slope,
          neck_forward_offset,
          ear_width_ratio,
          torso_tilt,
          shoulder_center_y,
          confidence,
          sample_count,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `
    )
    .run(
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
  const row = database
    .prepare(
      `
        SELECT *
        FROM calibrations
        WHERE is_active = 1
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `
    )
    .get()

  return mapCalibration(row)
}
