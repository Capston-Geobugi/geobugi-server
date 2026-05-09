/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react'

const BAD_STAGE_THRESHOLD = 7
const SCREEN = new URLSearchParams(window.location.search).get('screen')

function App() {
  const [ready, setReady] = useState(false)
  const [cvRunning, setCvRunning] = useState(false)
  const [monitoring, setMonitoring] = useState(false)
  const [calibrating, setCalibrating] = useState(false)
  const [statusText, setStatusText] = useState('Starting backend CV engine...')
  const [error, setError] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [neckStage, setNeckStage] = useState(1)
  const [cumulativeScore, setCumulativeScore] = useState(0)
  const [isPaused, setIsPaused] = useState(true)
  const [calibrationBaseline, setCalibrationBaseline] = useState(null)
  const [dailyReport, setDailyReport] = useState(null)
  const [weeklyReport, setWeeklyReport] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const status = await window.api.cv.start()
        if (cancelled) {
          return
        }

        setCvRunning(status.running)
        setCalibrationBaseline(status.calibrationBaseline)
        setReady(true)
        setStatusText('Backend CV engine is running. Run calibration before monitoring.')
      } catch (caughtError) {
        const details =
          caughtError instanceof Error
            ? `${caughtError.name}: ${caughtError.message}`
            : String(caughtError)
        setError(`Failed to start backend CV engine. ${details}`)
      }
    }

    const unsubscribe = window.api.cv.onEvent((message) => {
      if (!message) {
        return
      }

      if (message.type === 'REALTIME_UPDATE') {
        setNeckStage(message.payload.neck_stage)
        setCumulativeScore(message.payload.cumulative_score)
        setIsPaused(Boolean(message.payload.is_paused))
      }

      if (message.type === 'CALIB_DONE') {
        setCalibrationBaseline(message.payload?.baseline ?? null)
        setCalibrating(false)
        setStatusText('Calibration complete. You can start monitoring now.')

        if (SCREEN === 'calibration') {
          void window.api.appWindow.completeCalibration()
        }
      }

      if (message.type === 'STATUS') {
        if (message.payload?.running === true) {
          setCvRunning(true)
        } else if (message.payload?.running === false) {
          setCvRunning(false)
        } else if (message.payload === 'CALIBRATION_STARTED') {
          setStatusText('Calibration in progress. Hold a neutral posture for 5 seconds.')
        }
      }

      if (message.type === 'ERROR') {
        setError(message.payload)
      }
    })

    bootstrap()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  async function refreshReports() {
    const today = new Date()
    const todayIso = today.toISOString().slice(0, 10)
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - 6)

    const [daily, weekly] = await Promise.all([
      window.api.report.getDaily({ date: todayIso }),
      window.api.report.getWeekly({
        startDate: weekStart.toISOString().slice(0, 10),
        endDate: todayIso
      })
    ])

    setDailyReport(daily)
    setWeeklyReport(weekly)
  }

  async function handleCalibrationStart() {
    if (!ready) {
      return
    }

    setError('')
    setCalibrating(true)
    setStatusText('Calibration in progress. Hold a neutral posture for 5 seconds.')
    await window.api.cv.startCalibration()
  }

  async function handleMonitoringToggle() {
    if (monitoring) {
      const endedAt = new Date().toISOString()
      await window.api.cv.attachSession(null)

      if (sessionId) {
        await window.api.session.end({
          sessionId,
          endedAt,
          totalDurationSec: 0
        })
      }

      setMonitoring(false)
      setSessionId(null)
      setStatusText('Monitoring stopped.')
      await refreshReports()
      return
    }

    if (!calibrationBaseline) {
      setStatusText('Calibration is required before monitoring.')
      return
    }

    const status = await window.api.cv.start()
    setCvRunning(status.running)

    const response = await window.api.session.start({
      calibrationId: null,
      startedAt: new Date().toISOString()
    })

    await window.api.cv.attachSession(response.sessionId)
    setSessionId(response.sessionId)
    setMonitoring(true)
    setStatusText('Monitoring live posture in the backend CV engine.')
  }

  const postureState = getPostureState(neckStage, isPaused)
  const stateLabel = getStateLabel(postureState)
  const feedbackActive = monitoring && postureState === 'bad'

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Geobugi</p>
          <h1>Backend CV posture monitoring</h1>
          <p className="hero-description">
            MediaPipe now runs in the Python CV engine. React only controls calibration, monitoring,
            and reports from the backend posture stream.
          </p>
        </div>

        <div className="control-row">
          <button
            className="primary-button"
            onClick={handleCalibrationStart}
            disabled={!ready || calibrating}
          >
            {calibrating ? 'Calibrating...' : 'Run Calibration'}
          </button>
          <button
            className="secondary-button"
            onClick={handleMonitoringToggle}
            disabled={!ready || calibrating}
          >
            {monitoring ? 'Stop Monitoring' : 'Start Monitoring'}
          </button>
          <button
            className="secondary-button"
            onClick={() => void refreshReports()}
            disabled={!ready}
          >
            Refresh Reports
          </button>
        </div>

        <p className="status-line">{error || statusText}</p>

        {calibrating ? (
          <div className="progress-wrap" aria-hidden="true">
            <div className="progress-bar progress-bar-indeterminate" />
          </div>
        ) : null}
      </section>

      <section className="workspace-grid">
        <div
          className={`camera-card state-${postureState} ${feedbackActive ? 'feedback-active' : ''}`}
        >
          <div className="camera-header">
            <div>
              <p className="card-label">Backend CV State</p>
              <h2>{stateLabel}</h2>
            </div>
            <div className="state-pill">
              {monitoring ? 'Recording' : cvRunning ? 'Ready' : 'Stopped'}
            </div>
          </div>

          <div className="backend-stage">
            <div className="stage-number">{neckStage}</div>
            <div>
              <p className="stage-label">Neck Stage</p>
              <p className="muted-copy">
                {isPaused
                  ? 'Paused by CV engine. Move hands away from shoulders and keep face visible.'
                  : 'Realtime posture stream is active.'}
              </p>
            </div>
          </div>

          {feedbackActive ? (
            <div className="feedback-overlay feedback-overlay-static">
              <strong>Posture alert</strong>
              <span>Backend CV score reached a high-risk neck stage.</span>
            </div>
          ) : null}
        </div>

        <aside className="metrics-card">
          <p className="card-label">Metrics</p>
          <div className="metric-grid">
            <Metric label="Neck stage" value={neckStage} />
            <Metric label="Score" value={cumulativeScore} decimals={1} />
            <Metric label="Paused" value={isPaused ? 'YES' : 'NO'} />
            <Metric label="Baseline" value={calibrationBaseline} decimals={4} />
          </div>

          <div className="detail-block">
            <p className="card-label">Session</p>
            <p>{sessionId ? `Session #${sessionId}` : 'No active session'}</p>
          </div>

          <div className="detail-block">
            <p className="card-label">CV Process</p>
            <p>{cvRunning ? 'Python engine running' : 'Python engine stopped'}</p>
          </div>
        </aside>
      </section>

      <section className="report-grid">
        <article className="report-card">
          <p className="card-label">Daily Report</p>
          {dailyReport ? (
            <div className="report-stats">
              <p>Total: {dailyReport.totalDurationSec}s</p>
              <p>CV samples: {dailyReport.cvStats.sampleCount}</p>
              <p>Average rep: {formatCvValue(dailyReport.cvStats.averageRepValue)}</p>
              <p>Max rep: {formatCvValue(dailyReport.cvStats.maxRepValue)}</p>
              <p>Latest rep: {formatCvValue(dailyReport.cvStats.latestRepValue)}</p>
            </div>
          ) : (
            <p className="muted-copy">Refresh reports after running a monitoring session.</p>
          )}
        </article>

        <article className="report-card">
          <p className="card-label">Weekly Trend</p>
          {weeklyReport?.days?.length ? (
            <ul className="trend-list">
              {weeklyReport.days.map((day) => (
                <li key={day.date}>
                  <span>{day.date}</span>
                  <span>{formatCvValue(day.cvStats.averageRepValue)} avg rep</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">No weekly data yet.</p>
          )}
        </article>
      </section>
    </main>
  )
}

function getPostureState(neckStage, isPaused) {
  if (isPaused) {
    return 'warning'
  }

  if (neckStage >= BAD_STAGE_THRESHOLD) {
    return 'bad'
  }

  if (neckStage >= 4) {
    return 'warning'
  }

  return 'good'
}

function getStateLabel(state) {
  if (state === 'good') return 'GOOD'
  if (state === 'warning') return 'WARNING'
  if (state === 'bad') return 'BAD'
  return 'UNKNOWN'
}

function formatCvValue(value) {
  return typeof value === 'number' ? value.toFixed(2) : '--'
}

function Metric({ label, value, decimals = 0 }) {
  const displayValue =
    typeof value === 'number'
      ? value.toFixed(decimals)
      : value === null || value === undefined
        ? '--'
        : value

  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{displayValue}</strong>
    </div>
  )
}

export default App
