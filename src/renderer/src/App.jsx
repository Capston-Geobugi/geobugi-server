import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { geobugiApi } from './lib/api'
import AuthScreen from './screens/AuthScreen'
import CalibrationScreen from './screens/CalibrationScreen'
import HomeScreen from './screens/HomeScreen'
import IdleScreen from './screens/IdleScreen'
import LoadingScreen from './screens/LoadingScreen'
import NicknameOnboardingScreen from './screens/NicknameOnboardingScreen'
import PostureAdBannerScreen from './screens/PostureAdBannerScreen'
import ReportScreen from './screens/ReportScreen'
import SettingsScreen from './screens/SettingsScreen'
import SocialScreen from './screens/SocialScreen'
import StretchingScreen from './screens/StretchingScreen'

const POSTURE_RECOVERY_WINDOW_MS = 30 * 60 * 1000
const POSTURE_RECOVERY_SAMPLE_INTERVAL_MS = 30 * 1000
const POSTURE_RECOVERY_TARGET_SCORE = 70

function getAverageScore(samples) {
  const validSamples = samples.filter((sample) => Number.isFinite(sample))

  if (validSamples.length === 0) {
    return null
  }

  return validSamples.reduce((total, sample) => total + sample, 0) / validSamples.length
}

function createPostureRecoveryCycle(now = Date.now()) {
  return {
    mode: 'baseline',
    previousAverage: null,
    windowStartedAt: now,
    samples: []
  }
}

function App() {
  const initialScreen = new URLSearchParams(window.location.search).get('screen') || 'home'
  const isCalibrationWindow = initialScreen === 'calibration'
  const isPostureBannerWindow = initialScreen === 'posture-banner'
  const usesAuthGate = ['home', 'login', 'signup'].includes(initialScreen)
  const shouldPrepareCvOnBoot = usesAuthGate && !isPostureBannerWindow
  const [screen, setScreen] = useState(initialScreen)
  const [bootReady, setBootReady] = useState(!usesAuthGate)
  const [bootMessage, setBootMessage] = useState('앱 설정을 불러오고 있어요')
  const [bootProgress, setBootProgress] = useState(shouldPrepareCvOnBoot ? 8 : 100)
  const [calibration, setCalibration] = useState(null)
  const [report, setReport] = useState(null)
  const [monthlyReport, setMonthlyReport] = useState(null)
  const [settings, setSettings] = useState(null)
  const [profile, setProfile] = useState(null)
  const [cvStatus, setCvStatus] = useState('측정 대기 중')
  const [cvError, setCvError] = useState('')
  const [cvFrame, setCvFrame] = useState('')
  const [cvRealtime, setCvRealtime] = useState(null)
  const [isCvMonitoring, setIsCvMonitoring] = useState(false)
  const [paused, setPaused] = useState(false)
  const [reportInitialView, setReportInitialView] = useState('daily')
  const [authMode, setAuthMode] = useState('signup')
  const [authNotice, setAuthNotice] = useState('')
  const [signupRequiresEmailConfirmation, setSignupRequiresEmailConfirmation] = useState(false)
  const [selectedSocialRoom, setSelectedSocialRoom] = useState(null)
  const [stretchingReminderVisible, setStretchingReminderVisible] = useState(false)
  const [stretchingTimerStartedAt, setStretchingTimerStartedAt] = useState(() => Date.now())
  const [postureRecoveryBanner, setPostureRecoveryBanner] = useState(null)
  const stretchingIntervalRef = useRef(null)
  const postureScoreSyncEnabledRef = useRef(false)
  const postureRecoveryCycleRef = useRef(createPostureRecoveryCycle())
  const postureRecoveryBannerIdRef = useRef(0)
  const currentPostureScoreRef = useRef(null)
  const stretchingIntervalMinutes = Number(settings?.stretching?.intervalMinutes ?? 60)
  const hasCompletedPostureMeasurement = Boolean(calibration)

  const realtimePostureScore = useMemo(() => {
    if (typeof cvRealtime?.cumulative_score === 'number') {
      return Math.max(0, Math.round(100 - cvRealtime.cumulative_score))
    }

    return null
  }, [cvRealtime])

  const averagePostureScore = useMemo(() => {
    if (typeof report?.cvStats?.averageScore === 'number') {
      return Math.round(report.cvStats.averageScore)
    }

    if (report?.totalDurationSec > 0 && typeof report?.stateRatio?.good === 'number') {
      return Math.round(report.stateRatio.good * 100)
    }

    return null
  }, [report])
  const isRealtimeMeasuring = isCvMonitoring && !paused
  const postureScore = isRealtimeMeasuring ? realtimePostureScore : averagePostureScore
  const homeScoreTitle = isRealtimeMeasuring ? '실시간 자세 점수' : '오늘의 평균 자세 점수'

  useEffect(() => {
    currentPostureScoreRef.current =
      isRealtimeMeasuring && typeof realtimePostureScore === 'number' ? realtimePostureScore : null
  }, [isRealtimeMeasuring, realtimePostureScore])

  useEffect(() => {
    if (!isRealtimeMeasuring) {
      return undefined
    }

    function evaluatePostureRecoveryWindow() {
      const currentScore = currentPostureScoreRef.current

      if (typeof currentScore !== 'number') {
        return
      }

      const now = Date.now()
      const cycle = postureRecoveryCycleRef.current
      cycle.samples.push(currentScore)

      if (now - cycle.windowStartedAt < POSTURE_RECOVERY_WINDOW_MS) {
        return
      }

      const currentAverage = getAverageScore(cycle.samples)

      if (currentAverage === null) {
        postureRecoveryCycleRef.current = createPostureRecoveryCycle(now)
        return
      }

      if (cycle.mode === 'baseline') {
        if (currentAverage < POSTURE_RECOVERY_TARGET_SCORE) {
          postureRecoveryCycleRef.current = {
            mode: 'recovery',
            previousAverage: currentAverage,
            windowStartedAt: now,
            samples: []
          }
          return
        }

        postureRecoveryCycleRef.current = createPostureRecoveryCycle(now)
        return
      }

      const improved =
        currentAverage >= POSTURE_RECOVERY_TARGET_SCORE || currentAverage > cycle.previousAverage

      if (improved) {
        setPostureRecoveryBanner(null)
        postureRecoveryCycleRef.current = createPostureRecoveryCycle(now)
        return
      }

      const nextBannerId = postureRecoveryBannerIdRef.current + 1
      postureRecoveryBannerIdRef.current = nextBannerId
      setPostureRecoveryBanner({
        id: nextBannerId,
        previousAverage: cycle.previousAverage,
        currentAverage
      })
      postureRecoveryCycleRef.current = {
        mode: 'recovery',
        previousAverage: currentAverage,
        windowStartedAt: now,
        samples: []
      }
    }

    evaluatePostureRecoveryWindow()
    const intervalId = window.setInterval(
      evaluatePostureRecoveryWindow,
      POSTURE_RECOVERY_SAMPLE_INTERVAL_MS
    )

    return () => window.clearInterval(intervalId)
  }, [isRealtimeMeasuring])

  const refreshReport = useCallback(async (input = {}) => {
    const daily = await geobugiApi.getDailyReport(input)
    setReport(daily)

    if (postureScoreSyncEnabledRef.current) {
      void geobugiApi.syncDailyPostureScore(daily).catch((error) => {
        console.warn('Failed to sync daily posture score to Supabase:', error)
      })
    }

    return daily
  }, [])

  const refreshMonthlyReport = useCallback(async (input = {}) => {
    const monthly = await geobugiApi.getMonthlyReport(input)
    setMonthlyReport(monthly)
    return monthly
  }, [])

  const refreshUserScopedState = useCallback(async () => {
    const [nextProfile, activeCalibration, appSettings] = await Promise.all([
      geobugiApi.getProfile(),
      geobugiApi.getActiveCalibration(),
      geobugiApi.getSettings(),
      refreshReport(),
      refreshMonthlyReport()
    ])

    setProfile(nextProfile)
    setCalibration(activeCalibration)
    setSettings(appSettings)
    stretchingIntervalRef.current = Number(appSettings?.stretching?.intervalMinutes ?? 60)
  }, [refreshMonthlyReport, refreshReport])

  const restartStretchingTimer = useCallback(() => {
    setStretchingReminderVisible(false)
    setStretchingTimerStartedAt(Date.now())
  }, [])

  const showStretchingReminderNow = useCallback(() => {
    setStretchingTimerStartedAt(Date.now())
    setStretchingReminderVisible(true)
  }, [])

  const bootstrapServerState = useCallback(async () => {
    setBootMessage('앱 설정을 불러오고 있어요')
    setBootProgress(12)
    const [nextProfile, activeCalibration, appSettings] = await Promise.all([
      geobugiApi.getProfile(),
      geobugiApi.getActiveCalibration(),
      geobugiApi.getSettings(),
      refreshReport(),
      refreshMonthlyReport()
    ])
    setBootProgress(58)

    setProfile(nextProfile)
    setCalibration(activeCalibration)
    setSettings(appSettings)
    stretchingIntervalRef.current = Number(appSettings?.stretching?.intervalMinutes ?? 60)

    if (initialScreen === 'idle' && activeCalibration) {
      showStretchingReminderNow()
    } else {
      restartStretchingTimer()
    }

    if (shouldPrepareCvOnBoot) {
      setBootMessage('자세 측정 엔진을 준비하고 있어요')
      setBootProgress(68)
      await geobugiApi.prepareCv()
      setBootProgress(100)
    }

    setBootReady(true)
  }, [
    initialScreen,
    refreshMonthlyReport,
    refreshReport,
    restartStretchingTimer,
    shouldPrepareCvOnBoot,
    showStretchingReminderNow
  ])

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
    queueMicrotask(async () => {
      if (isPostureBannerWindow) {
        return
      }

      if (!usesAuthGate) {
        await bootstrapServerState()
        return
      }

      await bootstrapServerState()
      setBootMessage('계정 정보를 확인하고 있어요')

      try {
        const profile = await geobugiApi.getProfile()
        const nextAuthMode = profile?.remoteUserId ? 'login' : 'signup'
        setAuthMode(nextAuthMode)
        setScreen(nextAuthMode)
      } catch {
        setAuthMode('signup')
        setScreen('signup')
      }
    })
  }, [bootstrapServerState, isPostureBannerWindow, usesAuthGate])

  useEffect(() => {
    if (isPostureBannerWindow) {
      return undefined
    }

    if (screen !== 'idle') {
      void geobugiApi.closePostureBannerWindow()
      return undefined
    }

    if (postureRecoveryBanner?.id) {
      void geobugiApi.showPostureBannerWindow({ id: postureRecoveryBanner.id })
      return undefined
    }

    void geobugiApi.closePostureBannerWindow()
    return undefined
  }, [isPostureBannerWindow, postureRecoveryBanner?.id, screen])

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

    return window.api.appWindow.onStretchingCompleted(() => {
      restartStretchingTimer()
      void refreshReport()
    })
  }, [refreshReport, restartStretchingTimer])

  useEffect(() => {
    if (!window.api?.cv?.onEvent) {
      return undefined
    }

    return window.api.cv.onEvent((message) => {
      const allowedMainWindowCvEvents = ['REALTIME_UPDATE', 'STATUS', 'CAMERA_ERROR']

      if (!isCalibrationWindow && !allowedMainWindowCvEvents.includes(message.type)) {
        return
      }

      if (message.type === 'STATUS') {
        if (message.payload === 'PREVIEW_STARTED') {
          setIsCvMonitoring(true)
        }

        if (
          message.payload === 'PREVIEW_PAUSED' ||
          (typeof message.payload === 'object' && message.payload?.running === false)
        ) {
          setIsCvMonitoring(false)
          void refreshReport()
        }

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
  }, [handleCalibrationDone, isCalibrationWindow, refreshReport])

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
      setIsCvMonitoring(false)
      await refreshReport()
      return
    }

    await geobugiApi.resumeCvMonitoring()
    setPaused(false)
    setIsCvMonitoring(true)
  }

  async function handleOpenHomeFromIdle() {
    if (window.api?.appWindow?.openHome) {
      await window.api.appWindow.openHome()
      return
    }

    setScreen('home')
  }

  async function handleStartWidget() {
    await geobugiApi.startCvMonitoring()
    setIsCvMonitoring(true)
    setPaused(false)
    showStretchingReminderNow()

    if (window.api?.appWindow?.openIdle) {
      await window.api.appWindow.openIdle()
      return
    }

    setScreen('idle')
  }

  async function handleCloseIdle() {
    await geobugiApi.stopCv()
    setIsCvMonitoring(false)
    setCvRealtime(null)
    await refreshReport()

    if (window.api?.appWindow?.closeIdle) {
      await window.api.appWindow.closeIdle()
      return
    }

    window.close()
  }

  async function handleToggleWidgetFlip() {
    const currentWidgetSettings = settings?.widget ?? { opacity: 1, scale: 1, flipX: false }
    const nextSettings = await geobugiApi.updateWidgetSettings({
      ...currentWidgetSettings,
      flipX: !currentWidgetSettings.flipX
    })

    setSettings(nextSettings)
  }

  async function handleAuthSubmit({ email, password }) {
    if (authMode === 'login') {
      await geobugiApi.signInWithEmail({ email, password })
      postureScoreSyncEnabledRef.current = true
      setCalibration(null)
      setCvRealtime(null)
      setReport(null)
      setMonthlyReport(null)
      setAuthNotice('')
      setScreen('home')
      void refreshUserScopedState()
      return
    }

    const signedUpUser = await geobugiApi.signUpWithEmail({ email, password })
    setSignupRequiresEmailConfirmation(Boolean(signedUpUser?.requiresEmailConfirmation))
    postureScoreSyncEnabledRef.current = false
    setScreen('nickname-onboarding')
  }

  async function handleNicknameSubmit({ displayName }) {
    await geobugiApi.updateDisplayName({ displayName })
    const nextProfile = await geobugiApi.getProfile()
    setProfile(nextProfile)
    setAuthMode('login')
    setScreen('login')
    setAuthNotice(
      signupRequiresEmailConfirmation
        ? '닉네임이 저장됐어요. 이메일 인증을 완료한 뒤 로그인해주세요.'
        : '닉네임이 저장됐어요. 로그인해주세요.'
    )
  }

  if (isPostureBannerWindow) {
    const searchParams = new URLSearchParams(window.location.search)
    const bannerPosition = searchParams.get('position') === 'bottom' ? 'bottom' : 'top'

    return <PostureAdBannerScreen position={bannerPosition} />
  }

  if (!bootReady) {
    return <LoadingScreen message={bootMessage} progress={bootProgress} />
  }

  if (screen === 'signup' || screen === 'login') {
    return (
      <AuthScreen
        mode={authMode}
        notice={authNotice}
        onModeChange={(nextMode) => {
          setAuthMode(nextMode)
          setScreen(nextMode)
          setAuthNotice('')
        }}
        onSubmit={handleAuthSubmit}
      />
    )
  }

  if (screen === 'nickname-onboarding') {
    return <NicknameOnboardingScreen onSubmit={handleNicknameSubmit} />
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
          onClose={handleCloseIdle}
          onOpenHome={handleOpenHomeFromIdle}
          onOpenStretching={handleOpenStretching}
          onToggleFlip={handleToggleWidgetFlip}
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
        onOpenHome={() => setScreen('home')}
        onOpenReport={() => setScreen('report')}
        onOpenSocial={() => {
          setSelectedSocialRoom(null)
          setScreen('social')
        }}
        initialView={reportInitialView}
        onOpenSettings={() => setScreen('settings')}
      />
    )
  }

  if (screen === 'social') {
    return (
      <SocialScreen
        selectedRoom={selectedSocialRoom}
        onSelectRoom={(room) => {
          setSelectedSocialRoom(room)
          setScreen('social')
        }}
        onBackToList={() => setSelectedSocialRoom(null)}
        onOpenHome={() => setScreen('home')}
        onOpenReport={() => {
          setReportInitialView('daily')
          setScreen('report')
        }}
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
        onOpenHome={() => setScreen('home')}
        onOpenReport={() => {
          setReportInitialView('daily')
          setScreen('report')
        }}
        onOpenSocial={() => {
          setSelectedSocialRoom(null)
          setScreen('social')
        }}
      />
    )
  }

  return (
    <>
      <HomeScreen
        hasCalibration={Boolean(calibration)}
        displayName={profile?.displayName}
        score={postureScore}
        scoreTitle={homeScoreTitle}
        neckStage={cvRealtime?.neck_stage ?? 1}
        onMeasure={async () => {
          if (window.api?.appWindow?.openCalibration) {
            await window.api.appWindow.openCalibration()
            return
          }

          setScreen('calibration')
        }}
        onStartWidget={handleStartWidget}
        onReport={() => {
          setReportInitialView('daily')
          setScreen('report')
        }}
        onSocial={() => {
          setSelectedSocialRoom(null)
          setScreen('social')
        }}
        onSettings={() => setScreen('settings')}
      />
    </>
  )
}

export default App
