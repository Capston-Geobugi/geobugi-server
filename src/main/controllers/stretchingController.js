import { getDB } from '../database/db'

function mapMission(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    missionType: row.mission_type,
    reason: row.reason,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    verificationMode: row.verification_mode
  }
}

export function createMission({
  sessionId = null,
  missionType,
  reason,
  verificationMode,
  startedAt
}) {
  const database = getDB()
  const normalizedStartedAt = startedAt ?? new Date().toISOString()
  const result = database
    .prepare(
      `
        INSERT INTO stretching_missions (
          session_id,
          mission_type,
          reason,
          started_at,
          status,
          verification_mode
        ) VALUES (?, ?, ?, ?, 'pending', ?)
      `
    )
    .run(sessionId, missionType, reason, normalizedStartedAt, verificationMode)

  return { missionId: Number(result.lastInsertRowid) }
}

export function completeMission({ missionId, completedAt }) {
  const database = getDB()
  database
    .prepare(
      `
        UPDATE stretching_missions
        SET status = 'completed',
            completed_at = ?
        WHERE id = ?
      `
    )
    .run(completedAt ?? new Date().toISOString(), missionId)

  return { ok: true }
}

export function skipMission({ missionId }) {
  const database = getDB()
  database
    .prepare(
      `
        UPDATE stretching_missions
        SET status = 'skipped'
        WHERE id = ?
      `
    )
    .run(missionId)

  return { ok: true }
}

export function getPendingMissions() {
  const database = getDB()
  const rows = database
    .prepare(
      `
        SELECT *
        FROM stretching_missions
        WHERE status = 'pending'
        ORDER BY started_at ASC, id ASC
      `
    )
    .all()

  return rows.map(mapMission)
}
