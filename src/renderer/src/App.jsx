import { useCallback, useEffect, useMemo, useState } from 'react'

import { geobugiApi } from './lib/api'
import CalibrationScreen from './screens/CalibrationScreen'
import HomeScreen from './screens/HomeScreen'
import IdleScreen from './screens/IdleScreen'
import ReportScreen from './screens/ReportScreen'
import StretchingScreen from './screens/StretchingScreen'

function App() {
  const initialScreen = new URLSearchParams(window.location.search).get('screen') || 'home'
  const isCalibrationWindow = initialScreen === 'calibration'
  const [screen, setScreen] = useState(initialScreen)
  const [calibration, setCalibration] = useState(null)
  const [report, setReport] = useState(null)
  const [monthlyReport, setMonthlyReport] = useState(null)
  const [cvStatus, setCvStatus] = useState('측정 대기 중')
  const [cvError, setCvError] = useState('')
  const [cvFrame, setCvFrame] = useState('')
  const [cvRealtime, setCvRealtime] = useState(null)
  const [paused, setPaused] = useState(false)

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

  const bootstrapServerState = useCallback(async () => {
    const [activeCalibration] = await Promise.all([
      geobugiApi.getActiveCalibration(),
      refreshReport(),
      refreshMonthlyReport()
    ])

    if (activeCalibration) {
      setCalibration(activeCalibration)
    }
  }, [refreshMonthlyReport, refreshReport])

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

      if (isCalibrationWindow && window.api?.appWindow?.completeCalibration) {
        await window.api.appWindow.completeCalibration()
        return
      }

      setScreen('home')
    },
    [isCalibrationWindow]
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
      await refreshReport()
      setScreen('home')
    })
  }, [refreshReport])

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

  async function handleCalibrationStart() {
    setCvError('')
    setCvStatus('측정 중')
    await geobugiApi.startCvCalibration()
  }

  async function handleStretchingComplete() {
    await geobugiApi.completeStretching()
    await refreshReport()
    setScreen('home')
  }

  async function handlePauseMonitoring() {
    if (!paused) {
      await geobugiApi.stopCv()
      setPaused(true)
      return
    }

    await geobugiApi.startCvPreview()
    setPaused(false)
  }

  async function handleOpenHomeFromIdle() {
    if (window.api?.appWindow?.openHome) {
      await window.api.appWindow.openHome()
      return
    }

    setScreen('home')
  }

  if (screen === 'idle') {
    return (
      <IdleScreen
        realtime={cvRealtime}
        paused={paused}
        onPause={handlePauseMonitoring}
        onOpenHome={handleOpenHomeFromIdle}
      />
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
        onOpenStretching={() => setScreen('stretching')}
      />
    )
  }

  if (screen === 'stretching') {
    return (
      <StretchingScreen onBack={() => setScreen('home')} onComplete={handleStretchingComplete} />
    )
  }

  return (
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
      onReport={() => setScreen('report')}
      onStretching={() => setScreen('stretching')}
    />
  )
}

export default App
