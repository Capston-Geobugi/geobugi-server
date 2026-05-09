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

export const geobugiApi = {
  async getDailyReport() {
    if (window.api?.report?.getDaily) {
      const date = new Date().toISOString().slice(0, 10)
      return window.api.report.getDaily({ date })
    }

    return mockDailyReport
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
  }
}
