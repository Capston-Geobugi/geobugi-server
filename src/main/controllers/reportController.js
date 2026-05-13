import { getDB } from '../database/db'

const SAMPLE_DURATION_SEC = 60

function toLocalIsoDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getPreviousIsoDate(date) {
  const [year, month, day] = date.split('-').map(Number)
  const previousDate = new Date(Date.UTC(year, month - 1, day))
  previousDate.setUTCDate(previousDate.getUTCDate() - 1)

  return previousDate.toISOString().slice(0, 10)
}

function getMonthBounds(year, month) {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0)

  return {
    startDate: toLocalIsoDate(startDate),
    endDate: toLocalIsoDate(endDate)
  }
}

function normalizeMonthInput({ year, month } = {}) {
  const today = new Date()
  const normalizedYear = Number.isInteger(Number(year)) ? Number(year) : today.getFullYear()
  const normalizedMonth = Number.isInteger(Number(month)) ? Number(month) : today.getMonth() + 1

  if (normalizedMonth < 1 || normalizedMonth > 12) {
    throw new Error('month must be between 1 and 12.')
  }

  return {
    year: normalizedYear,
    month: normalizedMonth
  }
}

function toNumberOrNull(value) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function toPostureScore(repValue) {
  const numberValue = toNumberOrNull(repValue)
  if (numberValue === null) {
    return null
  }

  const score = Math.max(0, Math.min(100, 100 - numberValue))
  return Number(score.toFixed(1))
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

function createScoreTrend(samples) {
  return samples.map((sample) => ({
    measuredAt: sample.measuredAt,
    score: sample.score,
    repValue: sample.repValue
  }))
}

function createAverageScoreSummary(date, samples) {
  const cvStats = createCvStats(samples)

  return {
    date,
    averageScore: cvStats.averageScore,
    averageRepValue: cvStats.averageRepValue,
    sampleCount: cvStats.sampleCount
  }
}

function createAverageScoreComparison(today, yesterday) {
  const hasBothScores = today.averageScore !== null && yesterday.averageScore !== null
  const diff = hasBothScores ? today.averageScore - yesterday.averageScore : null
  const diffRate =
    hasBothScores && yesterday.averageScore !== 0 ? diff / yesterday.averageScore : null

  return {
    today,
    yesterday,
    diff,
    diffRate,
    direction: diff === null ? 'none' : diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'
  }
}

function createReportFromSamples(date, samples, yesterdaySamples = []) {
  const cvStats = createCvStats(samples)
  const totalDurationSec = cvStats.sampleCount * SAMPLE_DURATION_SEC
  const scoreRatio = cvStats.averageScore === null ? 0 : cvStats.averageScore / 100
  const yesterdayDate = getPreviousIsoDate(date)
  const todayScoreSummary = createAverageScoreSummary(date, samples)
  const yesterdayScoreSummary = createAverageScoreSummary(yesterdayDate, yesterdaySamples)

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
    scoreTrend: createScoreTrend(samples),
    averageScoreComparison: createAverageScoreComparison(todayScoreSummary, yesterdayScoreSummary),
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
  const targetDate = date ?? toLocalIsoDate()
  const yesterdayDate = getPreviousIsoDate(targetDate)
  const samples = getDailyCvSamples(database, targetDate)
  const yesterdaySamples = getDailyCvSamples(database, yesterdayDate)

  return createReportFromSamples(targetDate, samples, yesterdaySamples)
}

export function getMonthlyReport(input = {}) {
  const database = getDB()
  const { year, month } = normalizeMonthInput(input)
  const { startDate, endDate } = getMonthBounds(year, month)
  const rows = database
    .prepare(
      `
        SELECT date(measured_at) AS date
        FROM cv_posture_samples
        WHERE date(measured_at) BETWEEN date(?) AND date(?)
        GROUP BY date(measured_at)
        ORDER BY date(measured_at) ASC
      `
    )
    .all(startDate, endDate)

  return {
    year,
    month,
    startDate,
    endDate,
    reportDates: rows.map((row) => row.date)
  }
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
