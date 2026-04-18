import { getDB } from '../database/db'

function createEmptyDailyReport(date) {
  return {
    date,
    totalDurationSec: 0,
    stateRatio: {
      good: 0,
      warning: 0,
      bad: 0
    },
    warningCount: 0,
    badEventCount: 0,
    longestBadDurationSec: 0,
    stretchingCompletedCount: 0,
    stretchingSkippedCount: 0
  }
}

export function getDailyReport({ date } = {}) {
  const database = getDB()
  const report = createEmptyDailyReport(date)

  const postureStats = database
    .prepare(
      `
        SELECT
          COALESCE(SUM(duration_sec), 0) AS total_duration_sec,
          COALESCE(SUM(CASE WHEN state = 'good' THEN duration_sec ELSE 0 END), 0) AS good_duration_sec,
          COALESCE(SUM(CASE WHEN state = 'warning' THEN duration_sec ELSE 0 END), 0) AS warning_duration_sec,
          COALESCE(SUM(CASE WHEN state = 'bad' THEN duration_sec ELSE 0 END), 0) AS bad_duration_sec,
          COALESCE(SUM(CASE WHEN state = 'warning' THEN 1 ELSE 0 END), 0) AS warning_count,
          COALESCE(SUM(CASE WHEN state = 'bad' THEN 1 ELSE 0 END), 0) AS bad_event_count,
          COALESCE(MAX(CASE WHEN state = 'bad' THEN duration_sec ELSE 0 END), 0) AS longest_bad_duration_sec
        FROM posture_events
        WHERE date(started_at) = date(?)
      `
    )
    .get(date)

  const stretchingStats = database
    .prepare(
      `
        SELECT
          COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
          COALESCE(SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END), 0) AS skipped_count
        FROM stretching_missions
        WHERE date(started_at) = date(?)
      `
    )
    .get(date)

  report.totalDurationSec = postureStats.total_duration_sec
  report.warningCount = postureStats.warning_count
  report.badEventCount = postureStats.bad_event_count
  report.longestBadDurationSec = postureStats.longest_bad_duration_sec
  report.stretchingCompletedCount = stretchingStats.completed_count
  report.stretchingSkippedCount = stretchingStats.skipped_count

  if (report.totalDurationSec > 0) {
    report.stateRatio = {
      good: postureStats.good_duration_sec / report.totalDurationSec,
      warning: postureStats.warning_duration_sec / report.totalDurationSec,
      bad: postureStats.bad_duration_sec / report.totalDurationSec
    }
  }

  return report
}

export function getWeeklyReport({ startDate, endDate } = {}) {
  const database = getDB()
  const dailyRows = database
    .prepare(
      `
        SELECT
          date(started_at) AS date,
          COALESCE(SUM(duration_sec), 0) AS total_duration_sec,
          COALESCE(SUM(CASE WHEN state = 'good' THEN duration_sec ELSE 0 END), 0) AS good_duration_sec,
          COALESCE(SUM(CASE WHEN state = 'warning' THEN duration_sec ELSE 0 END), 0) AS warning_duration_sec,
          COALESCE(SUM(CASE WHEN state = 'bad' THEN duration_sec ELSE 0 END), 0) AS bad_duration_sec,
          COALESCE(SUM(CASE WHEN state = 'warning' THEN 1 ELSE 0 END), 0) AS warning_count,
          COALESCE(SUM(CASE WHEN state = 'bad' THEN 1 ELSE 0 END), 0) AS bad_event_count
        FROM posture_events
        WHERE date(started_at) BETWEEN date(?) AND date(?)
        GROUP BY date(started_at)
        ORDER BY date(started_at) ASC
      `
    )
    .all(startDate, endDate)

  const stretchingRows = database
    .prepare(
      `
        SELECT
          date(started_at) AS date,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
          COALESCE(SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END), 0) AS skipped_count
        FROM stretching_missions
        WHERE date(started_at) BETWEEN date(?) AND date(?)
        GROUP BY date(started_at)
      `
    )
    .all(startDate, endDate)

  const stretchingByDate = new Map(stretchingRows.map((row) => [row.date, row]))

  const days = dailyRows.map((row) => {
    const stretchRow = stretchingByDate.get(row.date)
    const totalDurationSec = row.total_duration_sec

    return {
      date: row.date,
      totalDurationSec,
      stateRatio: totalDurationSec
        ? {
            good: row.good_duration_sec / totalDurationSec,
            warning: row.warning_duration_sec / totalDurationSec,
            bad: row.bad_duration_sec / totalDurationSec
          }
        : { good: 0, warning: 0, bad: 0 },
      warningCount: row.warning_count,
      badEventCount: row.bad_event_count,
      stretchingCompletedCount: stretchRow?.completed_count ?? 0,
      stretchingSkippedCount: stretchRow?.skipped_count ?? 0
    }
  })

  return {
    startDate,
    endDate,
    days
  }
}
