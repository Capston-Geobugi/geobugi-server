import { getDB, withTransaction } from '../database/db'

let currentSessionId = null

function mapSession(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    calibrationId: row.calibration_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalDurationSec: row.total_duration_sec,
    warningCount: row.warning_count,
    badEventCount: row.bad_event_count
  }
}

function mapPostureEvent(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    state: row.state,
    issueType: row.issue_type,
    score: row.score,
    neckForwardOffset: row.neck_forward_offset,
    shoulderSlopeDelta: row.shoulder_slope_delta,
    torsoTiltDelta: row.torso_tilt_delta,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSec: row.duration_sec,
    triggeredFeedback: Boolean(row.triggered_feedback)
  }
}

export function startSession({ calibrationId = null, startedAt } = {}) {
  const database = getDB()
  const normalizedStartedAt = startedAt ?? new Date().toISOString()
  const result = database
    .prepare(
      `
        INSERT INTO posture_sessions (calibration_id, started_at)
        VALUES (?, ?)
      `
    )
    .run(calibrationId, normalizedStartedAt)

  currentSessionId = Number(result.lastInsertRowid)

  return { sessionId: currentSessionId }
}

export function endSession({ sessionId, endedAt, totalDurationSec = 0 }) {
  const database = getDB()
  const normalizedEndedAt = endedAt ?? new Date().toISOString()

  database
    .prepare(
      `
        UPDATE posture_sessions
        SET ended_at = ?, total_duration_sec = ?
        WHERE id = ?
      `
    )
    .run(normalizedEndedAt, totalDurationSec, sessionId)

  if (currentSessionId === sessionId) {
    currentSessionId = null
  }

  return { ok: true }
}

export function getCurrentSession() {
  if (!currentSessionId) {
    return null
  }

  const database = getDB()
  const row = database.prepare('SELECT * FROM posture_sessions WHERE id = ?').get(currentSessionId)

  return row ? { sessionId: Number(row.id) } : null
}

const logStateTransaction = withTransaction((input) => {
  const database = getDB()
  const {
    sessionId,
    state,
    issueType = null,
    score = null,
    neckForwardOffset = null,
    shoulderSlopeDelta = null,
    torsoTiltDelta = null,
    startedAt,
    endedAt = null,
    durationSec = 0,
    triggeredFeedback = false
  } = input

  database
    .prepare(
      `
        INSERT INTO posture_events (
          session_id,
          state,
          issue_type,
          score,
          neck_forward_offset,
          shoulder_slope_delta,
          torso_tilt_delta,
          started_at,
          ended_at,
          duration_sec,
          triggered_feedback
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      sessionId,
      state,
      issueType,
      score,
      neckForwardOffset,
      shoulderSlopeDelta,
      torsoTiltDelta,
      startedAt,
      endedAt,
      durationSec,
      triggeredFeedback ? 1 : 0
    )

  if (state === 'warning') {
    database
      .prepare('UPDATE posture_sessions SET warning_count = warning_count + 1 WHERE id = ?')
      .run(sessionId)
  }

  if (state === 'bad') {
    database
      .prepare('UPDATE posture_sessions SET bad_event_count = bad_event_count + 1 WHERE id = ?')
      .run(sessionId)
  }

  return { ok: true }
})

export function logState(input) {
  return logStateTransaction(input)
}

export function getRecentPostureEvents({ limit = 20 } = {}) {
  const database = getDB()
  const rows = database
    .prepare(
      `
        SELECT *
        FROM posture_events
        ORDER BY started_at DESC, id DESC
        LIMIT ?
      `
    )
    .all(limit)

  return rows.map(mapPostureEvent)
}

export function getSessionById(sessionId) {
  const database = getDB()
  const row = database.prepare('SELECT * FROM posture_sessions WHERE id = ?').get(sessionId)

  return mapSession(row)
}