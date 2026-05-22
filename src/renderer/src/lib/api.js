const mockDailyReport = {
  date: new Date().toISOString().slice(0, 10),
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
  startDate: new Date().toISOString().slice(0, 8) + '01',
  endDate: new Date().toISOString().slice(0, 10),
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
    scale: 1
  },
  stretching: {
    intervalMinutes: 60
  }
}

export const geobugiApi = {
  async getDailyReport(input = {}) {
    if (window.api?.report?.getDaily) {
      const date = input.date ?? new Date().toISOString().slice(0, 10)
      return window.api.report.getDaily({ date })
    }

    return {
      ...mockDailyReport,
      date: input.date ?? mockDailyReport.date
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

  async startCvPreview() {
    if (window.api?.cv?.startPreview) {
      return window.api.cv.startPreview()
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
      missionType: 'shoulder',
      reason: 'shoulder_asymmetry',
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
