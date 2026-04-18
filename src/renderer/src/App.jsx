import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

import { averageMetrics, classifyPosture, getUpperBodyMetrics, toDisplayState } from './lib/postureMetrics'

const MODEL_ASSET_PATH = '/mediapipe/models/pose_landmarker_full.task'
const WASM_ROOT = '/mediapipe/wasm'
const CALIBRATION_DURATION_MS = 5000
const BAD_FEEDBACK_THRESHOLD_MS = 5000

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const landmarkerRef = useRef(null)
  const animationFrameRef = useRef(0)
  const mediaStreamRef = useRef(null)
  const currentSegmentRef = useRef(null)
  const monitoringStartedAtRef = useRef(null)
  const lastVideoTimeRef = useRef(-1)
  const calibrationSamplesRef = useRef([])
  const calibrationStartedAtRef = useRef(null)
  const calibrationStartRequestedRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [monitoring, setMonitoring] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Loading MediaPipe model...')
  const [error, setError] = useState('')
  const [calibration, setCalibration] = useState(null)
  const [currentMetrics, setCurrentMetrics] = useState(null)
  const [postureState, setPostureState] = useState('warning')
  const [statusText, setStatusText] = useState('Prepare camera to begin.')
  const [sessionId, setSessionId] = useState(null)
  const [feedbackActive, setFeedbackActive] = useState(false)
  const [calibrating, setCalibrating] = useState(false)
  const [calibrationProgress, setCalibrationProgress] = useState(0)
  const [dailyReport, setDailyReport] = useState(null)
  const [weeklyReport, setWeeklyReport] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const activeCalibration = await window.api.calibration.getActive()
        if (cancelled) {
          return
        }

        if (activeCalibration) {
          setCalibration(activeCalibration)
        }

        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
        let landmarker

        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_ASSET_PATH,
              delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.7,
            minPosePresenceConfidence: 0.7,
            minTrackingConfidence: 0.7
          })
        } catch {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_ASSET_PATH,
              delegate: 'CPU'
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.7,
            minPosePresenceConfidence: 0.7,
            minTrackingConfidence: 0.7
          })
        }

        if (cancelled) {
          landmarker.close()
          return
        }

        landmarkerRef.current = landmarker
        setLoadingMessage('Requesting camera access...')

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          landmarker.close()
          return
        }

        mediaStreamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        await video.play()

        setReady(true)
        setCameraReady(true)
        setLoadingMessage('')
        setStatusText(activeCalibration ? 'Calibration loaded. Start monitoring when ready.' : 'Run calibration first.')

        animationFrameRef.current = requestAnimationFrame(processFrame)
      } catch (caughtError) {
        const details =
          caughtError instanceof Error
            ? `${caughtError.name}: ${caughtError.message}`
            : String(caughtError)
        setError(`Failed to initialize MediaPipe. ${details}`)
      }
    }

    bootstrap()

    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrameRef.current)
      stopCurrentStream()
      landmarkerRef.current?.close()
      landmarkerRef.current = null
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

  function stopCurrentStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }

  function drawFrame(video, result) {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    const width = video.videoWidth
    const height = video.videoHeight

    if (!width || !height) {
      return
    }

    canvas.width = width
    canvas.height = height

    context.save()
    context.clearRect(0, 0, width, height)
    context.translate(width, 0)
    context.scale(-1, 1)
    context.drawImage(video, 0, 0, width, height)

    if (result?.landmarks?.length) {
      const landmarks = result.landmarks[0]
      context.strokeStyle = 'rgba(245, 245, 245, 0.75)'
      context.fillStyle = 'rgba(245, 245, 245, 0.85)'
      context.lineWidth = 2

      const segments = [
        [0, 7],
        [0, 8],
        [7, 11],
        [8, 12],
        [11, 12]
      ]

      segments.forEach(([startIndex, endIndex]) => {
        const start = landmarks[startIndex]
        const end = landmarks[endIndex]
        if (!start || !end) {
          return
        }

        context.beginPath()
        context.moveTo(start.x * width, start.y * height)
        context.lineTo(end.x * width, end.y * height)
        context.stroke()
      })

      ;[0, 7, 8, 11, 12].forEach((index) => {
        const point = landmarks[index]
        if (!point) {
          return
        }

        context.beginPath()
        context.arc(point.x * width, point.y * height, 5, 0, Math.PI * 2)
        context.fill()
      })
    }

    context.restore()
  }

  function processFrame() {
    const video = videoRef.current
    const landmarker = landmarkerRef.current

    if (!video || !landmarker || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(processFrame)
      return
    }

    if (video.currentTime === lastVideoTimeRef.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame)
      return
    }

    lastVideoTimeRef.current = video.currentTime
    const now = performance.now()
    const result = landmarker.detectForVideo(video, now)
    drawFrame(video, result)

    const landmarks = result?.landmarks?.[0]
    const metrics = getUpperBodyMetrics(landmarks)
    if (metrics) {
      setCurrentMetrics(metrics)
    }

    if (metrics && calibrating) {
      calibrationSamplesRef.current.push(metrics)
      const elapsed = now - calibrationStartedAtRef.current
      const progress = Math.min(1, elapsed / CALIBRATION_DURATION_MS)
      setCalibrationProgress(progress)

      if (elapsed >= CALIBRATION_DURATION_MS) {
        void completeCalibration()
      }
    }

    if (metrics && monitoring && calibration) {
      updatePostureState(metrics)
    }

    animationFrameRef.current = requestAnimationFrame(processFrame)
  }

  async function completeCalibration() {
    if (!calibrationStartRequestedRef.current) {
      return
    }

    calibrationStartRequestedRef.current = false
    setCalibrating(false)

    const sampleCount = calibrationSamplesRef.current.length
    const averaged = averageMetrics(calibrationSamplesRef.current)
    calibrationSamplesRef.current = []
    setCalibrationProgress(0)

    if (!averaged) {
      setStatusText('Calibration failed. No stable landmarks were collected.')
      return
    }

    const saved = await window.api.calibration.save({
      shoulderSlope: averaged.shoulderSlope,
      neckForwardOffset: averaged.neckForwardOffset,
      earWidthRatio: averaged.earWidthRatio,
      torsoTilt: averaged.torsoTilt,
      shoulderCenterY: averaged.shoulderCenterY,
      confidence: 1,
      sampleCount
    })

    setCalibration(saved)
    setStatusText('Calibration saved. You can start monitoring now.')
  }

  function updatePostureState(metrics) {
    const evaluated = classifyPosture(metrics, calibration)
    const nextState = evaluated.state
    const nowIso = new Date().toISOString()
    setPostureState(nextState)

    const currentSegment = currentSegmentRef.current
    if (!currentSegment) {
      currentSegmentRef.current = {
        state: nextState,
        issueType: evaluated.issueType,
        score: evaluated.score,
        metrics,
        startedAt: nowIso,
        feedbackTriggered: false
      }
      setFeedbackActive(false)
      return
    }

    if (currentSegment.state !== nextState) {
      void persistSegment(currentSegment, nowIso)
      currentSegmentRef.current = {
        state: nextState,
        issueType: evaluated.issueType,
        score: evaluated.score,
        metrics,
        startedAt: nowIso,
        feedbackTriggered: false
      }
      setFeedbackActive(false)
      return
    }

    currentSegment.issueType = evaluated.issueType
    currentSegment.score = evaluated.score
    currentSegment.metrics = metrics

    if (nextState === 'bad') {
      const startedAt = new Date(currentSegment.startedAt).getTime()
      const badDuration = Date.now() - startedAt
      const shouldTriggerFeedback = badDuration >= BAD_FEEDBACK_THRESHOLD_MS
      currentSegment.feedbackTriggered = shouldTriggerFeedback
      setFeedbackActive(shouldTriggerFeedback)
    } else {
      currentSegment.feedbackTriggered = false
      setFeedbackActive(false)
    }
  }

  async function persistSegment(segment, endedAt) {
    if (!sessionId || !segment) {
      return
    }

    const durationSec = Math.max(0, Math.round((new Date(endedAt) - new Date(segment.startedAt)) / 1000))
    if (durationSec === 0) {
      return
    }

    await window.api.posture.logState({
      sessionId,
      state: segment.state,
      issueType: segment.issueType,
      score: segment.score,
      neckForwardOffset: segment.metrics.neckForwardOffset,
      shoulderSlopeDelta: segment.metrics.shoulderSlope - calibration.shoulderSlope,
      torsoTiltDelta: segment.metrics.torsoTilt - calibration.torsoTilt,
      startedAt: segment.startedAt,
      endedAt,
      durationSec,
      triggeredFeedback: segment.feedbackTriggered
    })
  }

  async function handleCalibrationStart() {
    if (!ready) {
      return
    }

    await window.api.calibration.start()
    calibrationSamplesRef.current = []
    calibrationStartedAtRef.current = performance.now()
    calibrationStartRequestedRef.current = true
    setCalibrating(true)
    setCalibrationProgress(0)
    setStatusText('Calibration in progress. Hold a neutral posture for 5 seconds.')
  }

  async function handleMonitoringToggle() {
    if (monitoring) {
      const endedAt = new Date().toISOString()
      await persistSegment(currentSegmentRef.current, endedAt)

      if (sessionId && monitoringStartedAtRef.current) {
        const totalDurationSec = Math.max(
          0,
          Math.round((Date.now() - monitoringStartedAtRef.current) / 1000)
        )
        await window.api.session.end({ sessionId, endedAt, totalDurationSec })
      }

      currentSegmentRef.current = null
      monitoringStartedAtRef.current = null
      setMonitoring(false)
      setSessionId(null)
      setFeedbackActive(false)
      setStatusText('Monitoring stopped.')
      await refreshReports()
      return
    }

    if (!calibration) {
      setStatusText('Calibration is required before monitoring.')
      return
    }

    const activeCalibration = await window.api.calibration.getActive()
    const startedAt = new Date().toISOString()
    const response = await window.api.session.start({
      calibrationId: activeCalibration?.id ?? null,
      startedAt
    })

    monitoringStartedAtRef.current = Date.now()
    currentSegmentRef.current = null
    setSessionId(response.sessionId)
    setMonitoring(true)
    setStatusText('Monitoring live posture now.')
  }

  const stateLabel = toDisplayState(postureState)

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Geobugi</p>
          <h1>Webcam posture coaching with MediaPipe</h1>
          <p className="hero-description">
            The renderer now measures upper-body posture in real time, calibrates a personal
            baseline, and stores session/posture data through the Electron APIs you built.
          </p>
        </div>

        <div className="control-row">
          <button className="primary-button" onClick={handleCalibrationStart} disabled={!ready || calibrating}>
            {calibrating ? 'Calibrating...' : 'Run Calibration'}
          </button>
          <button
            className="secondary-button"
            onClick={handleMonitoringToggle}
            disabled={!ready || calibrating || !cameraReady}
          >
            {monitoring ? 'Stop Monitoring' : 'Start Monitoring'}
          </button>
          <button className="secondary-button" onClick={() => void refreshReports()} disabled={!ready}>
            Refresh Reports
          </button>
        </div>

        <p className="status-line">{error || loadingMessage || statusText}</p>

        {calibrating ? (
          <div className="progress-wrap" aria-hidden="true">
            <div className="progress-bar" style={{ width: `${calibrationProgress * 100}%` }} />
          </div>
        ) : null}
      </section>

      <section className="workspace-grid">
        <div className={`camera-card state-${postureState} ${feedbackActive ? 'feedback-active' : ''}`}>
          <div className="camera-header">
            <div>
              <p className="card-label">Live Camera</p>
              <h2>{stateLabel}</h2>
            </div>
            <div className="state-pill">{monitoring ? 'Recording' : 'Idle'}</div>
          </div>

          <div className="camera-stage">
            <video ref={videoRef} className="camera-video" muted playsInline />
            <canvas ref={canvasRef} className="camera-canvas" />
            {feedbackActive ? (
              <div className="feedback-overlay">
                <strong>Posture alert</strong>
                <span>Bad posture has lasted more than 5 seconds. Reset your neck and shoulders.</span>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="metrics-card">
          <p className="card-label">Metrics</p>
          <div className="metric-grid">
            <Metric
              label="Neck offset"
              value={currentMetrics?.neckForwardOffset}
              baseline={calibration?.neckForwardOffset}
            />
            <Metric
              label="Ear width"
              value={currentMetrics?.earWidthRatio}
              baseline={calibration?.earWidthRatio}
            />
            <Metric
              label="Shoulder slope"
              value={currentMetrics?.shoulderSlope}
              baseline={calibration?.shoulderSlope}
            />
            <Metric label="Torso tilt" value={currentMetrics?.torsoTilt} baseline={calibration?.torsoTilt} />
          </div>

          <div className="detail-block">
            <p className="card-label">Session</p>
            <p>{sessionId ? `Session #${sessionId}` : 'No active session'}</p>
          </div>

          <div className="detail-block">
            <p className="card-label">Issue focus</p>
            <p>
              {currentMetrics && calibration
                ? classifyPosture(currentMetrics, calibration).issueType.replaceAll('_', ' ')
                : 'Run calibration to begin'}
            </p>
          </div>
        </aside>
      </section>

      <section className="report-grid">
        <article className="report-card">
          <p className="card-label">Daily Report</p>
          {dailyReport ? (
            <div className="report-stats">
              <p>Total: {dailyReport.totalDurationSec}s</p>
              <p>Good: {(dailyReport.stateRatio.good * 100).toFixed(1)}%</p>
              <p>Warning: {(dailyReport.stateRatio.warning * 100).toFixed(1)}%</p>
              <p>Bad: {(dailyReport.stateRatio.bad * 100).toFixed(1)}%</p>
              <p>Warnings: {dailyReport.warningCount}</p>
              <p>Bad events: {dailyReport.badEventCount}</p>
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
                  <span>{(day.stateRatio.bad * 100).toFixed(1)}% bad</span>
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

function Metric({ label, value, baseline }) {
  const hasValue = typeof value === 'number'
  const delta = hasValue && typeof baseline === 'number' ? value - baseline : null

  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{hasValue ? value.toFixed(3) : '--'}</strong>
      <small>{delta === null ? 'No baseline' : `Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`}</small>
    </div>
  )
}

export default App
