function toLocalIsoDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getLocalMonthStartDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}-01`
}

const mockDailyReport = {
  date: toLocalIsoDate(),
  totalDurationSec: 0,
  stateRatio: {
    good: 0,
    warning: 0,
    bad: 0
  },
  warningCount: 0,
  badEventCount: 0,
  longestBadDurationSec: 0,
  stretchingCompletedCount: 0,
  stretchingSkippedCount: 0
}

const mockMonthlyReport = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  startDate: getLocalMonthStartDate(),
  endDate: toLocalIsoDate(),
  reportDates: [],
  days: []
}

const mockSensitivityModes = [
  {
    id: 1,
    name: '기본 모드',
    userSensitivity: 10,
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 2,
    name: '영상 시청 모드',
    userSensitivity: 5,
    isActive: false,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 3,
    name: '작업 모드',
    userSensitivity: 15,
    isActive: false,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

const mockSettings = {
  widget: {
    opacity: 1,
    scale: 1,
    flipX: false
  },
  stretching: {
    intervalMinutes: 60
  }
}

function getDisplayNameFromEmail(email) {
  const localPart = String(email ?? '').split('@')[0].trim()
  return localPart.slice(0, 30) || 'geobugi'
}

function getMockRemoteUserId(email) {
  const normalizedEmail = String(email ?? 'mock@geobugi.local').trim().toLowerCase()
  let hash = 0

  for (let index = 0; index < normalizedEmail.length; index += 1) {
    hash = (hash * 31 + normalizedEmail.charCodeAt(index)) >>> 0
  }

  return `00000000-0000-4000-8000-${String(hash).padStart(12, '0').slice(-12)}`
}

async function syncMockProfile({ email }) {
  const displayName = getDisplayNameFromEmail(email)
  const remoteUserId = getMockRemoteUserId(email)

  await window.api?.profile?.update?.({ displayName })
  await window.api?.profile?.linkRemoteUser?.({ remoteUserId })

  return { id: remoteUserId, email, displayName, mock: true }
}

async function syncRemoteProfile({ user, email, shouldUpsertRemoteProfile = true }) {
  if (!user?.id) {
    throw new Error('사용자 정보를 확인하지 못했어요.')
  }

  const displayName = getDisplayNameFromEmail(email ?? user.email)

  if (shouldUpsertRemoteProfile) {
    const { getSupabase } = await import('./supabase')
    const supabase = getSupabase()
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      display_name: displayName
    })

    if (error) {
      throw error
    }
  }

  await window.api?.profile?.update?.({ displayName })
  await window.api?.profile?.linkRemoteUser?.({ remoteUserId: user.id })

  return { id: user.id, email: user.email ?? email, displayName }
}

function getFiniteNumber(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

async function getSupabaseClientIfConfigured() {
  try {
    const { getSupabase } = await import('./supabase')
    return getSupabase()
  } catch (error) {
    if (error instanceof Error && error.message.includes('Supabase environment variables')) {
      return null
    }

    throw error
  }
}

async function getAuthenticatedSupabase() {
  const supabase = await getSupabaseClientIfConfigured()

  if (!supabase) {
    throw new Error('Supabase 환경변수가 설정되어 있지 않아요.')
  }

  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  if (!data?.session?.user) {
    throw new Error('로그인이 필요해요.')
  }

  return supabase
}

export const geobugiApi = {
  async getProfile() {
    if (window.api?.profile?.get) {
      return window.api.profile.get()
    }

    return null
  },

  async signUpWithEmail({ email, password }) {
    let supabase

    try {
      const { getSupabase } = await import('./supabase')
      supabase = getSupabase()
    } catch (error) {
      if (error instanceof Error && error.message.includes('Supabase environment variables')) {
        return syncMockProfile({ email })
      }

      throw error
    }

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      throw error
    }

    return syncRemoteProfile({
      user: data.user,
      email,
      shouldUpsertRemoteProfile: Boolean(data.session)
    })
  },

  async signInWithEmail({ email, password }) {
    let supabase

    try {
      const { getSupabase } = await import('./supabase')
      supabase = getSupabase()
    } catch (error) {
      if (error instanceof Error && error.message.includes('Supabase environment variables')) {
        return syncMockProfile({ email })
      }

      throw error
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      throw error
    }

    return syncRemoteProfile({ user: data.user, email })
  },

  async syncDailyPostureScore(dailyReport) {
    const averageScore = getFiniteNumber(dailyReport?.cvStats?.averageScore)

    if (averageScore === null) {
      return null
    }

    const supabase = await getSupabaseClientIfConfigured()

    if (!supabase) {
      return null
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      throw sessionError
    }

    if (!sessionData?.session?.user) {
      return null
    }

    const sampleCount = getFiniteNumber(dailyReport?.cvStats?.sampleCount) ?? 0
    const totalDurationSec = getFiniteNumber(dailyReport?.totalDurationSec) ?? 0
    const { data, error } = await supabase.rpc('upsert_my_daily_posture_score', {
      target_score_date: dailyReport?.date ?? toLocalIsoDate(),
      target_average_score: averageScore,
      target_sample_count: Math.max(0, Math.round(sampleCount)),
      target_total_duration_sec: Math.max(0, Math.round(totalDurationSec))
    })

    if (error) {
      throw error
    }

    return data
  },

  async createRoom({ name }) {
    const supabase = await getAuthenticatedSupabase()
    const { data, error } = await supabase.rpc('create_room', {
      room_name: String(name ?? '').trim()
    })

    if (error) {
      throw error
    }

    return data?.[0] ?? null
  },

  async joinRoom({ inviteCode }) {
    const supabase = await getAuthenticatedSupabase()
    const { data, error } = await supabase.rpc('join_room', {
      room_invite_code: String(inviteCode ?? '').trim()
    })

    if (error) {
      throw error
    }

    return data?.[0] ?? null
  },

  async getMyRooms({ date } = {}) {
    const supabase = await getAuthenticatedSupabase()
    const targetDate = date ?? toLocalIsoDate()
    const { data, error } = await supabase.rpc('get_my_rooms', {
      target_score_date: targetDate
    })

    if (error) {
      throw error
    }

    return data ?? []
  },

  async getRoomDailyScores({ roomId, date } = {}) {
    const supabase = await getAuthenticatedSupabase()
    const { data, error } = await supabase.rpc('get_room_daily_scores', {
      target_room_id: roomId,
      target_score_date: date ?? toLocalIsoDate()
    })

    if (error) {
      throw error
    }

    return data ?? []
  },

  async getDailyReport(input = {}) {
    if (window.api?.report?.getDaily) {
      return window.api.report.getDaily(input.date ? { date: input.date } : {})
    }

    return {
      ...mockDailyReport,
      date: input.date ?? toLocalIsoDate()
    }
  },

  async getMonthlyReport(input = {}) {
    if (window.api?.report?.getMonthly) {
      const today = new Date()
      return window.api.report.getMonthly({
        year: input.year ?? today.getFullYear(),
        month: input.month ?? today.getMonth() + 1
      })
    }

    return mockMonthlyReport
  },

  async getActiveCalibration() {
    if (window.api?.calibration?.getActive) {
      return window.api.calibration.getActive()
    }

    return null
  },

  async saveCalibration(data) {
    if (window.api?.calibration?.save) {
      return window.api.calibration.save(data)
    }

    return { id: 1, ...data, createdAt: new Date().toISOString() }
  },

  async startCvCalibration() {
    if (window.api?.cv?.startCalibration) {
      return window.api.cv.startCalibration()
    }

    return { ok: true }
  },

  async prepareCv() {
    if (window.api?.cv?.prepare) {
      return window.api.cv.prepare()
    }

    return { ok: true, ready: true }
  },

  async startCvPreview() {
    if (window.api?.cv?.startPreview) {
      return window.api.cv.startPreview()
    }

    return { ok: true }
  },

  async pauseCvMonitoring() {
    if (window.api?.cv?.pauseMonitoring) {
      return window.api.cv.pauseMonitoring()
    }

    return { ok: true }
  },

  async resumeCvMonitoring() {
    if (window.api?.cv?.resumeMonitoring) {
      return window.api.cv.resumeMonitoring()
    }

    return { ok: true }
  },

  async stopCv() {
    if (window.api?.cv?.stop) {
      return window.api.cv.stop()
    }

    return { ok: true }
  },

  async completeStretching() {
    if (!window.api?.stretching?.createMission) {
      return { ok: true }
    }

    const mission = await window.api.stretching.createMission({
      missionType: 'neck',
      reason: 'neck_tension',
      verificationMode: 'manual'
    })

    return window.api.stretching.completeMission({ missionId: mission.missionId })
  },

  async getSensitivityModes() {
    if (window.api?.sensitivityMode?.list) {
      return window.api.sensitivityMode.list()
    }

    return mockSensitivityModes
  },

  async getActiveSensitivityMode() {
    if (window.api?.sensitivityMode?.getActive) {
      return window.api.sensitivityMode.getActive()
    }

    return mockSensitivityModes.find((mode) => mode.isActive) ?? null
  },

  async createSensitivityMode(input) {
    if (window.api?.sensitivityMode?.create) {
      return window.api.sensitivityMode.create(input)
    }

    const createdMode = {
      id: Date.now(),
      name: input.name,
      userSensitivity: input.userSensitivity,
      isActive: Boolean(input.activate),
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    if (createdMode.isActive) {
      mockSensitivityModes.forEach((mode) => {
        mode.isActive = false
      })
    }

    mockSensitivityModes.push(createdMode)
    return createdMode
  },

  async activateSensitivityMode(input) {
    if (window.api?.sensitivityMode?.activate) {
      return window.api.sensitivityMode.activate(input)
    }

    const activatedMode = mockSensitivityModes.find((mode) => mode.id === input.id) ?? null

    mockSensitivityModes.forEach((mode) => {
      mode.isActive = mode.id === input.id
    })

    return activatedMode
  },

  async deleteSensitivityMode(input) {
    if (window.api?.sensitivityMode?.delete) {
      return window.api.sensitivityMode.delete(input)
    }

    const modeIndex = mockSensitivityModes.findIndex((mode) => mode.id === input.id)

    if (modeIndex >= 0 && !mockSensitivityModes[modeIndex].isDefault) {
      const [deletedMode] = mockSensitivityModes.splice(modeIndex, 1)

      if (deletedMode.isActive && mockSensitivityModes[0]) {
        mockSensitivityModes[0].isActive = true
      }
    }

    return { ok: true }
  },

  async getSettings() {
    if (window.api?.settings?.get) {
      return window.api.settings.get()
    }

    return mockSettings
  },

  async updateWidgetSettings(input) {
    if (window.api?.settings?.updateWidget) {
      return window.api.settings.updateWidget(input)
    }

    mockSettings.widget = { ...mockSettings.widget, ...input }
    return mockSettings
  },

  async getIdleWindowBounds() {
    if (window.api?.appWindow?.getIdleBounds) {
      return window.api.appWindow.getIdleBounds()
    }

    return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
  },

  async moveIdleWindow(input) {
    if (window.api?.appWindow?.moveIdle) {
      return window.api.appWindow.moveIdle(input)
    }

    return { ok: true }
  },

  async updateStretchingSettings(input) {
    if (window.api?.settings?.updateStretching) {
      return window.api.settings.updateStretching(input)
    }

    mockSettings.stretching = { ...mockSettings.stretching, ...input }
    return mockSettings
  },

  onSettingsChanged(callback) {
    if (window.api?.settings?.onChanged) {
      return window.api.settings.onChanged(callback)
    }

    return () => {}
  }
}
