import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { geobugiApi } from './lib/api'
import CalibrationScreen from './screens/CalibrationScreen'
import HomeScreen from './screens/HomeScreen'
import IdleScreen from './screens/IdleScreen'
import LoadingScreen from './screens/LoadingScreen'
import ReportScreen from './screens/ReportScreen'
import SettingsScreen from './screens/SettingsScreen'
import StretchingScreen from './screens/StretchingScreen'

function App() {
  const initialScreen = new URLSearchParams(window.location.search).get('screen') || 'home'
  const isCalibrationWindow = initialScreen === 'calibration'
  const shouldPrepareCvOnBoot = initialScreen === 'home'
  const [screen, setScreen] = useState(initialScreen)
  const [bootReady, setBootReady] = useState(!shouldPrepareCvOnBoot)
  const [bootMessage, setBootMessage] = useState('앱 설정을 불러오고 있어요')
  const [bootProgress, setBootProgress] = useState(shouldPrepareCvOnBoot ? 8 : 100)
  const [calibration, setCalibration] = useState(null)
  const [report, setReport] = useState(null)
  const [monthlyReport, setMonthlyReport] = useState(null)
  const [settings, setSettings] = useState(null)
  const [cvStatus, setCvStatus] = useState('측정 대기 중')
  const [cvError, setCvError] = useState('')
  const [cvFrame, setCvFrame] = useState('')
  const [cvRealtime, setCvRealtime] = useState(null)
  const [paused, setPaused] = useState(false)
  const [reportInitialView, setReportInitialView] = useState('daily')
  const [stretchingReminderVisible, setStretchingReminderVisible] = useState(false)
  const [stretchingTimerStartedAt, setStretchingTimerStartedAt] = useState(() => Date.now())
  const stretchingIntervalRef = useRef(null)
  const stretchingIntervalMinutes = Number(settings?.stretching?.intervalMinutes ?? 60)
  const hasCompletedPostureMeasurement = Boolean(calibration)

  const postureScore = useMemo(() => {
    if (typeof cvRealtime?.cumulative_score === 'number') {
      return Math.max(0, Math.round(100 - cvRealtime.cumulative_score))
    }

    if (report?.totalDurationSec > 0 && typeof report?.stateRatio?.good === 'number') {
      return Math.round(report.stateRatio.good * 100)
    }

    return null
  }, [cvRealtime, report])

  const refreshReport = useCallback(async (input = {}) => {
    const daily = await geobugiApi.getDailyReport(input)
    setReport(daily)
    return daily
  }, [])

  const refreshMonthlyReport = useCallback(async (input = {}) => {
    const monthly = await geobugiApi.getMonthlyReport(input)
    setMonthlyReport(monthly)
    return monthly
  }, [])

  const restartStretchingTimer = useCallback(() => {
    setStretchingReminderVisible(false)
    setStretchingTimerStartedAt(Date.now())
  }, [])

  const bootstrapServerState = useCallback(async () => {
    setBootMessage('앱 설정을 불러오고 있어요')
    setBootProgress(12)
    const [activeCalibration, appSettings] = await Promise.all([
      geobugiApi.getActiveCalibration(),
      geobugiApi.getSettings(),
      refreshReport(),
      refreshMonthlyReport()
    ])
    setBootProgress(58)

    if (activeCalibration) {
      setCalibration(activeCalibration)
    }

    setSettings(appSettings)
    stretchingIntervalRef.current = Number(appSettings?.stretching?.intervalMinutes ?? 60)
    restartStretchingTimer()

    if (shouldPrepareCvOnBoot) {
      setBootMessage('자세 측정 엔진을 준비하고 있어요')
      setBootProgress(68)
      await geobugiApi.prepareCv()
      setBootProgress(100)
    }

    setBootReady(true)
  }, [refreshMonthlyReport, refreshReport, restartStretchingTimer, shouldPrepareCvOnBoot])

  const handleCalibrationDone = useCallback(
    async (payload) => {
      const baseline = Number(payload?.baseline ?? 0)
      const saved = await geobugiApi.saveCalibration({
        shoulderSlope: 0,
        neckForwardOffset: baseline,
        earWidthRatio: 0,
        torsoTilt: 0,
        shoulderCenterY: 0,
        confidence: 1,
        sampleCount: 150
      })

      setCalibration(saved)
      restartStretchingTimer()

      if (isCalibrationWindow && window.api?.appWindow?.completeCalibration) {
        await window.api.appWindow.completeCalibration()
        return
      }

      setScreen('home')
    },
    [isCalibrationWindow, restartStretchingTimer]
  )

  useEffect(() => {
    queueMicrotask(() => {
      void bootstrapServerState()
    })
  }, [bootstrapServerState])

  useEffect(() => {
    if (screen !== 'report') {
      return
    }

    queueMicrotask(() => {
      void refreshReport()
    })
  }, [refreshReport, screen])

  useEffect(() => {
    document.body.dataset.screen = screen

    return () => {
      delete document.body.dataset.screen
    }
  }, [screen])

  useEffect(() => {
    if (!window.api?.appWindow?.onCalibrationCompleted) {
      return undefined
    }

    return window.api.appWindow.onCalibrationCompleted(async () => {
      setCalibration({ id: 1 })
      restartStretchingTimer()
      await refreshReport()
      setScreen('home')
    })
  }, [refreshReport, restartStretchingTimer])

  useEffect(() => {
    if (!window.api?.appWindow?.onNavigate) {
      return undefined
    }

    return window.api.appWindow.onNavigate((nextScreen) => {
      if (typeof nextScreen === 'string') {
        setScreen(nextScreen)
      }
    })
  }, [])

  useEffect(() => {
    if (!window.api?.appWindow?.onStretchingCompleted) {
      return undefined
    }

    return window.api.appWindow.onStretchingCompleted(restartStretchingTimer)
  }, [restartStretchingTimer])

  useEffect(() => {
    if (!window.api?.cv?.onEvent) {
      return undefined
    }

    return window.api.cv.onEvent((message) => {
      if (!isCalibrationWindow && message.type !== 'REALTIME_UPDATE') {
        return
      }

      if (message.type === 'STATUS') {
        setCvStatus(
          message.payload === 'CALIBRATION_STARTED' ? 'CV 측정 중' : String(message.payload)
        )
      }

      if (message.type === 'FRAME') {
        setCvFrame(message.payload.src)
      }

      if (message.type === 'CAMERA_ERROR') {
        setCvError(String(message.payload))
      }

      if (message.type === 'CALIB_DONE') {
        void handleCalibrationDone(message.payload)
      }

      if (message.type === 'REALTIME_UPDATE') {
        setCvRealtime(message.payload)
        setCvStatus(
          `목 단계 ${message.payload.neck_stage} / 누적 ${message.payload.cumulative_score}`
        )
      }
    })
  }, [handleCalibrationDone, isCalibrationWindow])

  useEffect(() => {
    if (!window.api?.cv?.onError) {
      return undefined
    }

    return window.api.cv.onError((message) => {
      setCvError(String(message))
    })
  }, [])

  useEffect(() => {
    return geobugiApi.onSettingsChanged((nextSettings) => {
      setSettings(nextSettings)

      const nextStretchingInterval = Number(nextSettings?.stretching?.intervalMinutes ?? 60)
      if (stretchingIntervalRef.current !== nextStretchingInterval) {
        stretchingIntervalRef.current = nextStretchingInterval
        restartStretchingTimer()
      }
    })
  }, [restartStretchingTimer])

  useEffect(() => {
    if (
      !bootReady ||
      !settings ||
      !hasCompletedPostureMeasurement ||
      !Number.isFinite(stretchingIntervalMinutes) ||
      stretchingReminderVisible ||
      screen === 'stretching'
    ) {
      return undefined
    }

    const intervalMs = Math.max(1, stretchingIntervalMinutes) * 60 * 1000
    const elapsedMs = Date.now() - stretchingTimerStartedAt
    const remainingMs = Math.max(0, intervalMs - elapsedMs)
    const timerId = window.setTimeout(() => {
      setStretchingReminderVisible(true)
    }, remainingMs)

    return () => window.clearTimeout(timerId)
  }, [
    bootReady,
    hasCompletedPostureMeasurement,
    screen,
    settings,
    stretchingIntervalMinutes,
    stretchingReminderVisible,
    stretchingTimerStartedAt
  ])

  async function handleCalibrationStart() {
    setCvError('')
    setCvStatus('측정 중')
    await geobugiApi.startCvCalibration()
  }

  async function handleStretchingComplete() {
    await geobugiApi.completeStretching()
    await refreshReport()
    restartStretchingTimer()
    if (window.api?.appWindow?.completeStretching) {
      await window.api.appWindow.completeStretching()
    }
    setScreen('home')
  }

  function handleOpenStretching() {
    if (screen === 'idle' && window.api?.appWindow?.openStretching) {
      void window.api.appWindow.openStretching()
      return
    }

    setScreen('stretching')
  }

  async function handlePauseMonitoring() {
    if (!paused) {
      await geobugiApi.pauseCvMonitoring()
      setPaused(true)
      return
    }

    await geobugiApi.resumeCvMonitoring()
    setPaused(false)
  }

  async function handleOpenHomeFromIdle() {
    if (window.api?.appWindow?.openHome) {
      await window.api.appWindow.openHome()
      return
    }

    setScreen('home')
  }

  if (!bootReady) {
    return <LoadingScreen message={bootMessage} progress={bootProgress} />
  }

  if (screen === 'idle') {
    return (
      <>
        <IdleScreen
          realtime={cvRealtime}
          paused={paused}
          widgetSettings={settings?.widget}
          showStretchingReminder={stretchingReminderVisible && hasCompletedPostureMeasurement}
          onPause={handlePauseMonitoring}
          onOpenHome={handleOpenHomeFromIdle}
          onOpenStretching={handleOpenStretching}
        />
      </>
    )
  }

  if (screen === 'calibration') {
    return (
      <CalibrationScreen
        onBack={() => {
          if (isCalibrationWindow) {
            window.close()
            return
          }

          setScreen('home')
        }}
        onStart={handleCalibrationStart}
        onPreviewStart={geobugiApi.startCvPreview}
        cvStatus={cvStatus}
        cvError={cvError}
        cvFrame={cvFrame}
      />
    )
  }

  if (screen === 'report') {
    return (
      <ReportScreen
        report={report}
        monthlyReport={monthlyReport}
        score={postureScore}
        onBack={() => setScreen('home')}
        onLoadDailyReport={refreshReport}
        onLoadMonthlyReport={refreshMonthlyReport}
        onOpenReport={() => setScreen('report')}
        initialView={reportInitialView}
        onOpenStretching={handleOpenStretching}
        onOpenSettings={() => setScreen('settings')}
      />
    )
  }

  if (screen === 'stretching') {
    return (
      <StretchingScreen onBack={() => setScreen('home')} onComplete={handleStretchingComplete} />
    )
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        onBack={() => setScreen('home')}
        onOpenReport={() => {
          setReportInitialView('daily')
          setScreen('report')
        }}
        onOpenStretching={handleOpenStretching}
      />
    )
  }

  return (
    <>
      <HomeScreen
        hasCalibration={Boolean(calibration)}
        score={postureScore}
        onMeasure={async () => {
          if (window.api?.appWindow?.openCalibration) {
            await window.api.appWindow.openCalibration()
            return
          }

          setScreen('calibration')
        }}
        onReport={() => {
          setReportInitialView('daily')
          setScreen('report')
        }}
        onStretching={handleOpenStretching}
        onSettings={() => setScreen('settings')}
      />
    </>
  )
}

export default App
