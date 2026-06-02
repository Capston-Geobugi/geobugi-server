/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'

import BottomNav from '../components/BottomNav'
import { getScoreToneClass } from '../lib/scoreTone'

const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const chartLayout = {
  left: 4,
  width: 292,
  plotTop: 10,
  plotBottom: 122
}
const chartXAxisTicks = [
  { label: '0:00', minuteOfDay: 0 },
  { label: '06:00', minuteOfDay: 6 * 60 },
  { label: '12:00', minuteOfDay: 12 * 60 },
  { label: '18:00', minuteOfDay: 18 * 60 },
  { label: '23:00', minuteOfDay: 23 * 60 }
]

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

function formatShortKoreanDate(dateText) {
  if (!dateText) {
    return ''
  }

  const date = new Date(`${dateText}T00:00:00`)
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
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

function getChartTimeDomain(trend) {
  const measuredMinutes = Array.isArray(trend)
    ? trend.map((item) => item.minuteOfDay).filter((minute) => Number.isFinite(minute))
    : []
  const tickMinutes = chartXAxisTicks.map((tick) => tick.minuteOfDay)

  return {
    startMinute: Math.min(...tickMinutes, ...measuredMinutes),
    endMinute: Math.max(...tickMinutes, ...measuredMinutes)
  }
}

function toChartX(minuteOfDay, domain) {
  const span = Math.max(1, domain.endMinute - domain.startMinute)
  const timePosition = (minuteOfDay - domain.startMinute) / span

  return chartLayout.left + chartLayout.width * Math.min(1, Math.max(0, timePosition))
}

function toChartPoint(item, domain) {
  const plotHeight = chartLayout.plotBottom - chartLayout.plotTop
  const x = toChartX(item.minuteOfDay, domain)
  const hasData = typeof item.score === 'number'

  return {
    x,
    y: hasData
      ? chartLayout.plotBottom - Math.min(1, Math.max(0, item.score / 100)) * plotHeight
      : chartLayout.plotBottom,
    hasData,
    ...item
  }
}

function createXAxisLabels(domain) {
  return chartXAxisTicks.map((tick) => ({
    ...tick,
    x: toChartX(tick.minuteOfDay, domain)
  }))
}

function createTrendPath(trend, measuredToneClass = '') {
  const domain = getChartTimeDomain(trend)
  const labels = createXAxisLabels(domain)

  if (!Array.isArray(trend) || trend.length === 0) {
    return {
      lineSegments: [],
      fillSegments: [],
      dataPoints: [],
      labels,
      hoverSlots: []
    }
  }

  const points = trend.map((item) => toChartPoint(item, domain))
  const dataPoints = points.filter((point, index) => {
    const previousPoint = points[index - 1]
    const nextPoint = points[index + 1]
    const connectsToPrevious = previousPoint && point.hourOfDay - previousPoint.hourOfDay === 1
    const connectsToNext = nextPoint && nextPoint.hourOfDay - point.hourOfDay === 1

    return !(connectsToPrevious && connectsToNext)
  })
  const continuousSegments = points.reduce((segments, point, index) => {
    const previousPoint = points[index - 1]
    const pointCommand = `L${point.x.toFixed(1)} ${point.y.toFixed(1)}`

    if (!previousPoint || point.hourOfDay - previousPoint.hourOfDay !== 1) {
      segments.push({
        d: `M${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
        pointCount: 1,
        toneClass: measuredToneClass
      })
      return segments
    }

    const currentSegment = segments[segments.length - 1]
    currentSegment.d = `${currentSegment.d} ${pointCommand}`
    currentSegment.pointCount += 1
    return segments
  }, [])

  return {
    lineSegments: continuousSegments.filter((segment) => segment.pointCount > 1),
    fillSegments: [],
    dataPoints,
    labels,
    hoverSlots: points
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
    const hourKey = `${item.measuredAt.slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00`
    const bucket = buckets.get(hourKey) ?? {
      measuredAt: hourKey,
      hourOfDay: hour,
      minuteOfDay: hour * 60,
      scoreTotal: 0,
      repValueTotal: 0,
      repValueCount: 0,
      sampleCount: 0
    }

    bucket.scoreTotal += score
    if (Number.isFinite(repValue)) {
      bucket.repValueTotal += repValue
      bucket.repValueCount += 1
    }
    bucket.sampleCount += 1
    buckets.set(hourKey, bucket)
  }

  return [...buckets.values()]
    .sort((bucketA, bucketB) => bucketA.measuredAt.localeCompare(bucketB.measuredAt))
    .map((bucket) => ({
      measuredAt: bucket.measuredAt,
      hourOfDay: bucket.hourOfDay,
      minuteOfDay: bucket.minuteOfDay,
      score: Number((bucket.scoreTotal / bucket.sampleCount).toFixed(1)),
      repValue:
        bucket.repValueCount > 0
          ? Number((bucket.repValueTotal / bucket.repValueCount).toFixed(1))
          : null,
      label: bucket.measuredAt.slice(11, 13) + ':00',
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
  onOpenHome,
  onOpenReport,
  onOpenSocial,
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
  const currentScoreLabel =
    selectedDailyDate === todayLocalDate ? '오늘' : formatShortKoreanDate(selectedDailyDate)

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
              <h2>오늘의 시간대별 자세 추이</h2>
            </div>
            <div className="chart-shell">
              <div className="chart-y-labels" aria-hidden="true">
                <span>100</span>
                <span>50</span>
                <span>0</span>
              </div>
              <div className="chart-area">
                <svg className="chart" viewBox="0 0 300 146" aria-hidden="true">
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
                      <stop offset="0%" stopColor="#f05252" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#f05252" stopOpacity="0" />
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
                        height="146"
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
                      y="140"
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
        onHome={onOpenHome}
        onReport={onOpenReport}
        onSocial={onOpenSocial}
        onSettings={onOpenSettings}
      />
    </main>
  )
}

export default ReportScreen
