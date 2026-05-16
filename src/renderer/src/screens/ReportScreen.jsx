/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'

import BottomNav from '../components/BottomNav'

const weekdays = ['일', '월', '화', '수', '목', '금', '토']

function formatKoreanDate(dateText) {
  if (!dateText) {
    return ''
  }

  const date = new Date(`${dateText}T00:00:00`)
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(date)
}

function toChartPoint(item, index, totalCount) {
  const width = 273
  const measuredDate = new Date(item.measuredAt)
  const hour = measuredDate.getHours() + measuredDate.getMinutes() / 60
  const fallbackPosition = index / Math.max(1, totalCount - 1)
  const timePosition = Number.isNaN(measuredDate.getTime())
    ? fallbackPosition
    : Math.min(1, Math.max(0, (hour - 9) / 9))
  const x = 15 + width * timePosition

  if (typeof item.score !== 'number') {
    return {
      x,
      y: 118,
      hasData: false
    }
  }

  return {
    x,
    y: 122 - Math.min(1, Math.max(0, item.score / 100)) * 112,
    hasData: true
  }
}

function createTrendPath(trend) {
  if (!Array.isArray(trend) || trend.length < 2) {
    return {
      dataSegments: [],
      fills: [],
      dataPoints: []
    }
  }

  const points = trend.map((item, index) => toChartPoint(item, index, trend.length))
  const dataSegments = []
  const fills = []
  const pointsWithData = points.filter((point) => point.hasData)

  for (let index = 0; index < points.length - 1; index += 1) {
    const currentPoint = points[index]
    const nextPoint = points[index + 1]

    if (currentPoint.hasData && nextPoint.hasData) {
      const line = `M${currentPoint.x.toFixed(1)} ${currentPoint.y.toFixed(1)} L${nextPoint.x.toFixed(1)} ${nextPoint.y.toFixed(1)}`
      dataSegments.push(line)
      fills.push(`${line} L${nextPoint.x.toFixed(1)} 122 L${currentPoint.x.toFixed(1)} 122 Z`)
      continue
    }
  }

  return {
    dataSegments,
    fills,
    dataPoints: pointsWithData.length === 1 ? pointsWithData : []
  }
}

function createHourlyTrend(trend) {
  if (!Array.isArray(trend)) {
    return []
  }

  const buckets = new Map()

  for (const item of trend) {
    const measuredDate = new Date(item.measuredAt)
    const score = Number(item.score)
    const repValue = Number(item.repValue)

    if (Number.isNaN(measuredDate.getTime()) || !Number.isFinite(score)) {
      continue
    }

    const hour = measuredDate.getHours()
    const bucket = buckets.get(hour) ?? {
      measuredAt: `${item.measuredAt.slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00`,
      scoreTotal: 0,
      repValueTotal: 0,
      sampleCount: 0
    }

    bucket.scoreTotal += score
    bucket.repValueTotal += Number.isFinite(repValue) ? repValue : 0
    bucket.sampleCount += 1
    buckets.set(hour, bucket)
  }

  const reportDate = trend[0]?.measuredAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)

  return Array.from({ length: 10 }, (_, index) => {
    const hour = index + 9
    const bucket = buckets.get(hour)

    if (!bucket) {
      return {
        measuredAt: `${reportDate}T${String(hour).padStart(2, '0')}:00:00`,
        score: null,
        repValue: null,
        sampleCount: 0
      }
    }

    return {
      measuredAt: bucket.measuredAt,
      score: Number((bucket.scoreTotal / bucket.sampleCount).toFixed(1)),
      repValue: Number((bucket.repValueTotal / bucket.sampleCount).toFixed(1)),
      sampleCount: bucket.sampleCount
    }
  })
}

function getMonthCells(year, month) {
  const firstDate = new Date(year, month - 1, 1)
  const lastDate = new Date(year, month, 0)
  const firstDay = firstDate.getDay()
  const daysInMonth = lastDate.getDate()
  const previousLastDate = new Date(year, month - 1, 0).getDate()
  const cells = []

  for (let index = firstDay - 1; index >= 0; index -= 1) {
    cells.push({
      day: previousLastDate - index,
      currentMonth: false
    })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      day,
      currentMonth: true,
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    })
  }

  let nextDay = 1
  while (cells.length % 7 !== 0 || cells.length < 42) {
    cells.push({
      day: nextDay,
      currentMonth: false
    })
    nextDay += 1
  }

  return cells
}

function ReportScreen({
  report,
  monthlyReport,
  score,
  onBack,
  onLoadDailyReport,
  onLoadMonthlyReport,
  onOpenReport,
  onOpenStretching
}) {
  const [view, setView] = useState('daily')
  const [visibleMonth, setVisibleMonth] = useState(() => new Date())
  const visibleYear = visibleMonth.getFullYear()
  const visibleMonthNumber = visibleMonth.getMonth() + 1

  useEffect(() => {
    if (view !== 'monthly') {
      return
    }

    void onLoadMonthlyReport?.({ year: visibleYear, month: visibleMonthNumber })
  }, [onLoadMonthlyReport, view, visibleMonthNumber, visibleYear])

  const hasDailySamples = Number(report?.cvStats?.sampleCount ?? 0) > 0
  const dailyScore = hasDailySamples ? report?.cvStats?.averageScore : score
  const hasDailyScore = typeof dailyScore === 'number'
  const scoreLabel = typeof dailyScore === 'number' ? `${Math.round(dailyScore)}점` : '--'
  const yesterdayScore = report?.averageScoreComparison?.yesterday?.averageScore
  const yesterdayLabel =
    typeof yesterdayScore === 'number' ? `${Math.round(yesterdayScore)}점` : '--'
  const scoreDiff = report?.averageScoreComparison?.diff
  const scoreDeltaLabel =
    typeof scoreDiff === 'number'
      ? `${scoreDiff >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(scoreDiff))}점`
      : '변화 없음'
  const displayTrend = useMemo(() => createHourlyTrend(report?.scoreTrend), [report?.scoreTrend])
  const trendPath = useMemo(() => createTrendPath(displayTrend), [displayTrend])
  const reportDates = useMemo(() => new Set(monthlyReport?.reportDates ?? []), [monthlyReport])
  const monthCells = useMemo(
    () => getMonthCells(visibleYear, visibleMonthNumber),
    [visibleMonthNumber, visibleYear]
  )

  function moveMonth(offset) {
    setVisibleMonth(new Date(visibleYear, visibleMonthNumber - 1 + offset, 1))
  }

  async function openDailyReport(date) {
    await onLoadDailyReport?.({ date })
    setView('daily')
  }

  return (
    <main className={`app-frame report-screen ${view === 'daily' ? 'daily-report-screen' : ''}`}>
      <header className="report-top">
        <button
          className="icon-button report-back"
          type="button"
          onClick={onBack}
          aria-label="뒤로 가기"
        >
          <ArrowLeft size={28} />
        </button>
        <div className="report-title">
          <h1>{view === 'daily' ? '일일 리포트' : '월별 리포트'}</h1>
          <p>
            {view === 'daily' ? formatKoreanDate(report?.date) : '날짜별 자세 리포트를 확인하세요'}
          </p>
        </div>
        <div className="report-toggle" role="tablist" aria-label="리포트 종류">
          <button
            className={view === 'daily' ? 'active' : ''}
            type="button"
            onClick={() => setView('daily')}
          >
            일일
          </button>
          <button
            className={view === 'monthly' ? 'active' : ''}
            type="button"
            onClick={() => setView('monthly')}
          >
            월별
          </button>
        </div>
      </header>

      {view === 'daily' ? (
        <>
          <section className="report-card trend-card">
            <div className="card-heading">
              <h2>오늘의 자세 추이</h2>
              <strong>{hasDailyScore ? `양호 ${Math.round(dailyScore)}점` : '--'}</strong>
            </div>
            <div className="chart-shell">
              <div className="chart-y-labels" aria-hidden="true">
                <span>100</span>
                <span>50</span>
                <span>0</span>
              </div>
              <div className="chart-area">
                <svg className="chart" viewBox="0 0 300 130" aria-hidden="true">
                  <defs>
                    <linearGradient id="dailyChartFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#18bd84" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#18bd84" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {trendPath.fills.map((path, index) => (
                    <path key={`fill-${index}`} className="chart-fill" d={path} />
                  ))}
                  {trendPath.dataSegments.map((path, index) => (
                    <path key={`line-${index}`} className="chart-line" d={path} />
                  ))}
                  {trendPath.dataPoints.map((point, index) => (
                    <circle
                      key={`point-${index}`}
                      className="chart-point"
                      cx={point.x}
                      cy={point.y}
                      r="4"
                    />
                  ))}
                </svg>
                <div className="chart-labels">
                  <span>09:00</span>
                  <span>12:00</span>
                  <span>15:00</span>
                  <span>18:00</span>
                </div>
              </div>
            </div>
          </section>

          <section className="report-card score-card">
            <h2>평균 자세 점수 비교</h2>
            <div className="score-row">
              <div>
                <span>어제</span>
                <b>{yesterdayLabel}</b>
              </div>
              <em className={typeof scoreDiff === 'number' && scoreDiff < 0 ? 'down' : ''}>
                {scoreDeltaLabel}
              </em>
              <div>
                <span>오늘</span>
                <strong>{scoreLabel}</strong>
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="month-picker">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">
              <ChevronLeft size={30} />
            </button>
            <strong>
              {visibleYear}년 {visibleMonthNumber}월
            </strong>
            <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">
              <ChevronRight size={30} />
            </button>
          </section>

          <section className="report-card calendar-card">
            <div className="weekday-row">
              {weekdays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {monthCells.map((cell, index) => {
                const hasReport = cell.date ? reportDates.has(cell.date) : false

                return (
                  <button
                    key={`${cell.date ?? 'empty'}-${index}`}
                    className={!cell.currentMonth ? 'muted' : ''}
                    type="button"
                    disabled={!cell.currentMonth}
                    onClick={() => {
                      if (cell.date) {
                        void openDailyReport(cell.date)
                      }
                    }}
                  >
                    <span>{cell.day}</span>
                    {hasReport ? <i aria-label="리포트 있음" /> : null}
                  </button>
                )
              })}
            </div>
          </section>
        </>
      )}

      <BottomNav active="report" onReport={onOpenReport} onStretching={onOpenStretching} />
    </main>
  )
}

export default ReportScreen
