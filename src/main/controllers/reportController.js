import { getDB } from '../database/db'

const SAMPLE_DURATION_SEC = 60

function toNumberOrNull(value) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function toPostureScore(repValue) {
  const numberValue = toNumberOrNull(repValue)
  if (numberValue === null) {
    return null
  }

  return Math.max(0, Math.min(100, Math.round(100 - numberValue)))
}

function createCvStats(samples) {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      averageRepValue: null,
      minRepValue: null,
      maxRepValue: null,
      latestRepValue: null,
      averageScore: null,
      latestScore: null
    }
  }

  const repValues = samples.map((sample) => sample.repValue)
  const latestSample = samples[samples.length - 1]
  const averageRepValue = repValues.reduce((total, value) => total + value, 0) / repValues.length

  return {
    sampleCount: samples.length,
    averageRepValue,
    minRepValue: Math.min(...repValues),
    maxRepValue: Math.max(...repValues),
    latestRepValue: latestSample.repValue,
    averageScore: toPostureScore(averageRepValue),
    latestScore: latestSample.score
  }
}

function createReportFromSamples(date, samples) {
  const cvStats = createCvStats(samples)
  const totalDurationSec = cvStats.sampleCount * SAMPLE_DURATION_SEC
  const scoreRatio = cvStats.averageScore === null ? 0 : cvStats.averageScore / 100

  return {
    date,
    totalDurationSec,
    stateRatio: {
      good: scoreRatio,
      warning: 0,
      bad: 0
    },
    warningCount: 0,
    badEventCount: 0,
    longestBadDurationSec: 0,
    stretchingCompletedCount: 0,
    stretchingSkippedCount: 0,
    cvStats,
    samples
  }
}

function getDailyCvSamples(database, date) {
  const rows = database
    .prepare(
      `
        SELECT measured_at, rep_value
        FROM cv_posture_samples
        WHERE date(measured_at) = date(?)
        ORDER BY measured_at ASC, id ASC
      `
    )
    .all(date)

  return rows
    .map((row) => {
      const repValue = toNumberOrNull(row.rep_value)
      if (repValue === null) {
        return null
      }

      return {
        measuredAt: row.measured_at,
        repValue,
        score: toPostureScore(repValue)
      }
    })
    .filter(Boolean)
}

export function getDailyReport({ date } = {}) {
  const database = getDB()
  const targetDate = date ?? new Date().toISOString().slice(0, 10)
  const samples = getDailyCvSamples(database, targetDate)

  return createReportFromSamples(targetDate, samples)
}

export function getWeeklyReport({ startDate, endDate } = {}) {
  const database = getDB()
  const rows = database
    .prepare(
      `
        SELECT
          date(measured_at) AS date,
          COUNT(*) AS sample_count,
          AVG(rep_value) AS average_rep_value,
          MIN(rep_value) AS min_rep_value,
          MAX(rep_value) AS max_rep_value
        FROM cv_posture_samples
        WHERE date(measured_at) BETWEEN date(?) AND date(?)
        GROUP BY date(measured_at)
        ORDER BY date(measured_at) ASC
      `
    )
    .all(startDate, endDate)

  const days = rows.map((row) => {
    const averageScore = toPostureScore(row.average_rep_value)
    const totalDurationSec = row.sample_count * SAMPLE_DURATION_SEC

    return {
      date: row.date,
      totalDurationSec,
      stateRatio: {
        good: averageScore === null ? 0 : averageScore / 100,
        warning: 0,
        bad: 0
      },
      warningCount: 0,
      badEventCount: 0,
      stretchingCompletedCount: 0,
      stretchingSkippedCount: 0,
      cvStats: {
        sampleCount: row.sample_count,
        averageRepValue: row.average_rep_value,
        minRepValue: row.min_rep_value,
        maxRepValue: row.max_rep_value,
        averageScore
      }
    }
  })

  return {
    startDate,
    endDate,
    days
  }
}
