/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'

import BottomNav from '../components/BottomNav'
import { getScoreToneClass } from '../lib/scoreTone'

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

function toLocalIsoDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function addDaysToIsoDate(dateText, offset) {
  const baseDate = dateText ? new Date(`${dateText}T00:00:00`) : new Date()
  baseDate.setDate(baseDate.getDate() + offset)

  return toLocalIsoDate(baseDate)
}

function toChartPoint(item, index, totalCount) {
  const left = 4
  const width = 292
  const plotTop = 10
  const plotBottom = 122
  const plotHeight = plotBottom - plotTop
  const timePosition = totalCount <= 1 ? 0.5 : index / (totalCount - 1)
  const x = left + width * timePosition
  const hasData = typeof item.score === 'number'

  return {
    x,
    y: hasData ? plotBottom - Math.min(1, Math.max(0, item.score / 100)) * plotHeight : plotBottom,
    hasData,
    ...item
  }
}

function createTrendPath(trend, measuredToneClass = '') {
  if (!Array.isArray(trend) || trend.length === 0) {
    return {
      lineSegments: [],
      fillSegments: [],
      dataPoints: [],
      labels: [],
      hoverSlots: []
    }
  }

  const trendByHour = new Map(trend.map((item) => [new Date(item.measuredAt).getHours(), item]))
  const hours = [...trendByHour.keys()].sort((hourA, hourB) => hourA - hourB)
  const firstHour = hours[0]
  const lastHour = hours[hours.length - 1]
  const slots = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => {
    const hour = firstHour + index
    const item = trendByHour.get(hour)

    return {
      measuredAt:
        item?.measuredAt ??
        `${trend[0].measuredAt.slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00`,
      score: item?.score ?? null,
      repValue: item?.repValue ?? null,
      sampleCount: item?.sampleCount ?? 0
    }
  })
  const points = slots.map((item, index) => {
    const hour = new Date(item.measuredAt).getHours()
    const point = toChartPoint(item, index, slots.length)

    return {
      ...point,
      label: `${String(hour).padStart(2, '0')}:00`,
      labelVisible: false
    }
  })
  const dataPoints = points.filter((point) => point.hasData)
  const interpolatedPoints = points.map((point, index) => {
    if (point.hasData) {
      return point
    }

    const previousPoint = [...points.slice(0, index)].reverse().find((item) => item.hasData)
    const nextPoint = points.slice(index + 1).find((item) => item.hasData)

    if (!previousPoint || !nextPoint) {
      return point
    }

    const progress = (point.x - previousPoint.x) / (nextPoint.x - previousPoint.x)

    return {
      ...point,
      y: previousPoint.y + (nextPoint.y - previousPoint.y) * progress
    }
  })
  const labels =
    dataPoints.length <= 4
      ? dataPoints
      : [
          dataPoints[0],
          dataPoints[Math.floor((dataPoints.length - 1) / 3)],
          dataPoints[Math.floor(((dataPoints.length - 1) * 2) / 3)],
          dataPoints[dataPoints.length - 1]
        ]

  if (dataPoints.length === 1) {
    return {
      lineSegments: [],
      fillSegments: [],
      dataPoints,
      labels,
      hoverSlots: interpolatedPoints
    }
  }

  const segments = interpolatedPoints.slice(1).flatMap((point, index) => {
    const previousPoint = interpolatedPoints[index]
    const x1 = previousPoint.x.toFixed(1)
    const y1 = previousPoint.y.toFixed(1)
    const x2 = point.x.toFixed(1)
    const y2 = point.y.toFixed(1)
    const midX = ((previousPoint.x + point.x) / 2).toFixed(1)
    const midY = ((previousPoint.y + point.y) / 2).toFixed(1)
    const previousToneClass = previousPoint.hasData ? measuredToneClass : ''
    const currentToneClass = point.hasData ? measuredToneClass : ''

    return [
      {
        toneClass: previousToneClass,
        line: `M${x1} ${y1} L${midX} ${midY}`,
        fill: `M${x1} ${y1} L${midX} ${midY} L${midX} 122 L${x1} 122 Z`
      },
      {
        toneClass: currentToneClass,
        line: `M${midX} ${midY} L${x2} ${y2}`,
        fill: `M${midX} ${midY} L${x2} ${y2} L${x2} 122 L${midX} 122 Z`
      }
    ]
  })

  return {
    lineSegments: segments.map((segment) => ({
      d: segment.line,
      toneClass: segment.toneClass
    })),
    fillSegments: segments.map((segment) => ({
      d: segment.fill,
      toneClass: segment.toneClass
    })),
    dataPoints: [],
    labels,
    hoverSlots: interpolatedPoints
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

  return [...buckets.entries()]
    .sort(([hourA], [hourB]) => hourA - hourB)
    .map(([, bucket]) => ({
      measuredAt: bucket.measuredAt,
      score: Number((bucket.scoreTotal / bucket.sampleCount).toFixed(1)),
      repValue: Number((bucket.repValueTotal / bucket.sampleCount).toFixed(1)),
      sampleCount: bucket.sampleCount
    }))
}

function getChartToneClass(toneClass) {
  return toneClass || 'score-tone-empty'
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
  onBack,
  onLoadDailyReport,
  onLoadMonthlyReport,
  initialView = 'daily',
  onOpenReport,
  onOpenStretching,
  onOpenSettings
}) {
  const [view, setView] = useState(initialView)
  const [visibleMonth, setVisibleMonth] = useState(() => new Date())
  const [hoveredChartSlot, setHoveredChartSlot] = useState(null)
  const visibleYear = visibleMonth.getFullYear()
  const visibleMonthNumber = visibleMonth.getMonth() + 1
  const todayLocalDate = toLocalIsoDate()
  const selectedDailyDate = report?.date ?? todayLocalDate
  const canMoveToNextDailyDate = selectedDailyDate < todayLocalDate
  const previousScoreLabel = selectedDailyDate === todayLocalDate ? '어제' : '전날'
  const currentScoreLabel = selectedDailyDate === todayLocalDate ? '오늘' : '선택일'

  useEffect(() => {
    setView(initialView)
  }, [initialView])

  useEffect(() => {
    if (view !== 'monthly') {
      return
    }

    void onLoadMonthlyReport?.({ year: visibleYear, month: visibleMonthNumber })
  }, [onLoadMonthlyReport, view, visibleMonthNumber, visibleYear])

  const hasDailySamples = Number(report?.cvStats?.sampleCount ?? 0) > 0
  const dailyScore = hasDailySamples ? report?.cvStats?.averageScore : null
  const scoreLabel = typeof dailyScore === 'number' ? `${Math.round(dailyScore)}점` : '--'
  const dailyScoreToneClass = getScoreToneClass(dailyScore)
  const yesterdayScore = report?.averageScoreComparison?.yesterday?.averageScore
  const yesterdayLabel =
    typeof yesterdayScore === 'number' ? `${Math.round(yesterdayScore)}점` : '--'
  const yesterdayScoreToneClass = getScoreToneClass(yesterdayScore)
  const scoreDiff = report?.averageScoreComparison?.diff
  const scoreDeltaLabel =
    typeof scoreDiff === 'number'
      ? `${scoreDiff >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(scoreDiff))}점`
      : '변화 없음'
  const stretchingCompletedCount = Math.max(0, Number(report?.stretchingCompletedCount ?? 0))
  const stretchingCompletedLabel = Number.isFinite(stretchingCompletedCount)
    ? `${stretchingCompletedCount}회`
    : '0회'
  const displayTrend = useMemo(() => createHourlyTrend(report?.scoreTrend), [report?.scoreTrend])
  const trendPath = useMemo(
    () => createTrendPath(displayTrend, dailyScoreToneClass),
    [dailyScoreToneClass, displayTrend]
  )
  const reportDates = useMemo(() => new Set(monthlyReport?.reportDates ?? []), [monthlyReport])
  const monthlyDaysByDate = useMemo(
    () => new Map((monthlyReport?.days ?? []).map((day) => [day.date, day])),
    [monthlyReport]
  )
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

  async function moveDailyDate(offset) {
    const nextDate = addDaysToIsoDate(selectedDailyDate, offset)
    await openDailyReport(nextDate)
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
          <div className="report-title-row">
            <h1>{view === 'daily' ? '일일 리포트' : '월별 리포트'}</h1>
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
          </div>
          <p>
            {view === 'daily'
              ? formatKoreanDate(selectedDailyDate)
              : '날짜별 자세 리포트를 확인하세요'}
          </p>
        </div>
        {view === 'daily' ? (
          <div className="report-date-nav" aria-label="일일 리포트 날짜 이동">
            <button type="button" onClick={() => void moveDailyDate(-1)} aria-label="이전 날짜">
              <ChevronLeft size={24} />
            </button>
            <span>
              {selectedDailyDate === todayLocalDate ? '오늘' : formatKoreanDate(selectedDailyDate)}
            </span>
            <button
              type="button"
              onClick={() => void moveDailyDate(1)}
              disabled={!canMoveToNextDailyDate}
              aria-label="다음 날짜"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        ) : null}
      </header>

      {view === 'daily' ? (
        <>
          <section className="report-card trend-card">
            <div className="card-heading">
              <h2>오늘의 자세 추이</h2>
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
                    <linearGradient id="dailyChartFillGood" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#18bd84" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#18bd84" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="dailyChartFillWarning" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.24" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="dailyChartFillDanger" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="dailyChartFillEmpty" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.24" />
                      <stop offset="100%" stopColor="#cbd5e1" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line className="chart-grid-line" x1="0" x2="300" y1="10" y2="10" />
                  <line className="chart-grid-line" x1="0" x2="300" y1="66" y2="66" />
                  <line className="chart-grid-line" x1="0" x2="300" y1="122" y2="122" />
                  {trendPath.fillSegments.map((segment, index) => (
                    <path
                      key={`fill-${index}`}
                      className={`chart-fill ${getChartToneClass(segment.toneClass)}`}
                      d={segment.d}
                    />
                  ))}
                  {trendPath.lineSegments.map((segment, index) => (
                    <path
                      key={`line-${index}`}
                      className={`chart-line ${getChartToneClass(segment.toneClass)}`}
                      d={segment.d}
                    />
                  ))}
                  {trendPath.dataPoints.map((point, index) => (
                    <circle
                      key={`point-${index}`}
                      className={`chart-point ${dailyScoreToneClass}`}
                      cx={point.x}
                      cy={point.y}
                      r="4"
                    />
                  ))}
                  {trendPath.hoverSlots.map((slot, index) => {
                    const previousSlot = trendPath.hoverSlots[index - 1]
                    const nextSlot = trendPath.hoverSlots[index + 1]
                    const leftEdge = previousSlot ? (previousSlot.x + slot.x) / 2 : 0
                    const rightEdge = nextSlot ? (nextSlot.x + slot.x) / 2 : 300

                    return (
                      <rect
                        key={`hover-${slot.label}`}
                        className="chart-hover-zone"
                        x={leftEdge}
                        y="0"
                        width={rightEdge - leftEdge}
                        height="130"
                        onMouseEnter={() => setHoveredChartSlot(slot)}
                        onMouseLeave={() => setHoveredChartSlot(null)}
                      />
                    )
                  })}
                  {trendPath.labels.map((point) => (
                    <text
                      key={`label-${point.label}`}
                      className="chart-x-label"
                      x={point.x}
                      y="129"
                      textAnchor="middle"
                    >
                      {point.label}
                    </text>
                  ))}
                </svg>
                {hoveredChartSlot ? (
                  <div
                    className={`chart-tooltip ${
                      hoveredChartSlot.hasData ? getScoreToneClass(hoveredChartSlot.score) : 'empty'
                    }`}
                    style={{
                      left: `${Math.min(92, Math.max(8, (hoveredChartSlot.x / 300) * 100))}%`,
                      top: `${Math.max(10, (hoveredChartSlot.y / 130) * 100)}%`
                    }}
                  >
                    <span>{hoveredChartSlot.label}</span>
                    <strong>
                      {hoveredChartSlot.hasData
                        ? `${Math.round(hoveredChartSlot.score)}점`
                        : '측정값 없음'}
                    </strong>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="report-card score-card">
            <h2>평균 자세 점수 비교</h2>
            <div className="score-row">
              <div>
                <span>{previousScoreLabel}</span>
                <b className={yesterdayScoreToneClass}>{yesterdayLabel}</b>
              </div>
              <em className={typeof scoreDiff === 'number' && scoreDiff < 0 ? 'down' : ''}>
                {scoreDeltaLabel}
              </em>
              <div>
                <span>{currentScoreLabel}</span>
                <strong className={dailyScoreToneClass}>{scoreLabel}</strong>
              </div>
            </div>
          </section>

          <section className="report-card stretching-count-card">
            <div className="stretching-count-icon" aria-hidden="true">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h2>스트레칭 완료 횟수</h2>
              <span>오늘 완료한 스트레칭</span>
            </div>
            <strong>{stretchingCompletedLabel}</strong>
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
                const monthlyDay = cell.date ? monthlyDaysByDate.get(cell.date) : null
                const monthlyScoreToneClass = getScoreToneClass(monthlyDay?.averageScore)

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
                    {hasReport ? (
                      <i className={monthlyScoreToneClass} aria-label="리포트 있음" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </section>
        </>
      )}

      <BottomNav
        active="report"
        onReport={onOpenReport}
        onStretching={onOpenStretching}
        onSettings={onOpenSettings}
      />
    </main>
  )
}

export default ReportScreen
