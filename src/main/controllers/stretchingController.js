import { getDB } from '../database/db'
import { getCurrentRemoteUserId } from './profileController'

function mapMission(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    remoteUserId: row.remote_user_id,
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
  const remoteUserId = getCurrentRemoteUserId()
  const normalizedStartedAt = startedAt ?? new Date().toISOString()
  const result = database
    .prepare(
      `
        INSERT INTO stretching_missions (
          session_id,
          remote_user_id,
          mission_type,
          reason,
          started_at,
          status,
          verification_mode
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `
    )
    .run(sessionId, remoteUserId, missionType, reason, normalizedStartedAt, verificationMode)

  return { missionId: Number(result.lastInsertRowid) }
}

export function completeMission({ missionId, completedAt }) {
  const database = getDB()
  const remoteUserId = getCurrentRemoteUserId()
  database
    .prepare(
      `
        UPDATE stretching_missions
        SET status = 'completed',
            completed_at = ?,
            remote_user_id = COALESCE(remote_user_id, ?)
        WHERE id = ?
      `
    )
    .run(completedAt ?? new Date().toISOString(), remoteUserId, missionId)

  return { ok: true }
}

export function skipMission({ missionId }) {
  const database = getDB()
  const remoteUserId = getCurrentRemoteUserId()
  database
    .prepare(
      `
        UPDATE stretching_missions
        SET status = 'skipped',
            remote_user_id = COALESCE(remote_user_id, ?)
        WHERE id = ?
      `
    )
    .run(remoteUserId, missionId)

  return { ok: true }
}

export function getPendingMissions() {
  const database = getDB()
  const remoteUserId = getCurrentRemoteUserId()

  if (!remoteUserId) {
    return []
  }

  const rows = database
    .prepare(
      `
        SELECT *
        FROM stretching_missions
        WHERE remote_user_id = ?
          AND status = 'pending'
        ORDER BY started_at ASC, id ASC
      `
    )
    .all(remoteUserId)

  return rows.map(mapMission)
}
