import { ipcMain } from 'electron'

import {
  getActiveCalibration,
  saveCalibration,
  startCalibration
} from '../controllers/calibrationController'
import {
  endSession,
  getCurrentSession,
  getRecentPostureEvents,
  logState,
  startSession
} from '../controllers/postureController'
import { getDailyReport, getMonthlyReport, getWeeklyReport } from '../controllers/reportController'
import {
  attachCvSession,
  getCvStatus,
  pauseCvMonitoring,
  prepareCvProcess,
  resumeCvMonitoring,
  setCvSensitivity,
  startCvCalibration,
  startCvPreview,
  startCvProcess,
  stopCvProcess
} from '../controllers/cvController'
import {
  completeMission,
  createMission,
  getPendingMissions,
  skipMission
} from '../controllers/stretchingController'
import {
  activateSensitivityMode,
  createSensitivityMode,
  deleteSensitivityMode,
  getActiveSensitivityMode,
  getSensitivityModes,
  updateSensitivityMode
} from '../controllers/sensitivityModeController'
import {
  getSettings,
  updateStretchingSettings,
  updateWidgetSettings
} from '../controllers/settingsController'

let handlersRegistered = false

export function registerIpcHandlers({ onWidgetSettingsChanged } = {}) {
  if (handlersRegistered) {
    return
  }

  handlersRegistered = true

  ipcMain.handle('calibration:getActive', () => getActiveCalibration())
  ipcMain.handle('calibration:start', () => startCalibration())
  ipcMain.handle('calibration:save', (_event, input) => saveCalibration(input))

  ipcMain.handle('session:start', (_event, input) => startSession(input ?? {}))
  ipcMain.handle('session:end', (_event, input) => endSession(input))
  ipcMain.handle('session:getCurrent', () => getCurrentSession())

  ipcMain.handle('posture:logState', (_event, input) => logState(input))
  ipcMain.handle('posture:getRecent', (_event, input) => getRecentPostureEvents(input))

  ipcMain.handle('stretching:createMission', (_event, input) => createMission(input))
  ipcMain.handle('stretching:completeMission', (_event, input) => completeMission(input))
  ipcMain.handle('stretching:skipMission', (_event, input) => skipMission(input))
  ipcMain.handle('stretching:getPending', () => getPendingMissions())

  ipcMain.handle('report:getDaily', (_event, input) => getDailyReport(input))
  ipcMain.handle('report:getMonthly', (_event, input) => getMonthlyReport(input))
  ipcMain.handle('report:getWeekly', (_event, input) => getWeeklyReport(input))

  ipcMain.handle('cv:start', () => startCvProcess())
  ipcMain.handle('cv:prepare', () => prepareCvProcess())
  ipcMain.handle('cv:startPreview', () => startCvPreview())
  ipcMain.handle('cv:startCalibration', () => startCvCalibration())
  ipcMain.handle('cv:pauseMonitoring', () => pauseCvMonitoring())
  ipcMain.handle('cv:resumeMonitoring', () => resumeCvMonitoring())
  ipcMain.handle('cv:stop', () => stopCvProcess())
  ipcMain.handle('cv:getStatus', () => getCvStatus())
  ipcMain.handle('cv:attachSession', (_event, sessionId) => attachCvSession(sessionId))
  ipcMain.handle('cv:setSensitivity', (_event, value) => setCvSensitivity(value))

  ipcMain.handle('sensitivityMode:list', () => getSensitivityModes())
  ipcMain.handle('sensitivityMode:getActive', () => getActiveSensitivityMode())
  ipcMain.handle('sensitivityMode:create', (_event, input) => createSensitivityMode(input))
  ipcMain.handle('sensitivityMode:update', (_event, input) => updateSensitivityMode(input))
  ipcMain.handle('sensitivityMode:delete', (_event, input) => deleteSensitivityMode(input))
  ipcMain.handle('sensitivityMode:activate', (_event, input) => activateSensitivityMode(input))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:updateWidget', (_event, input) => {
    const settings = updateWidgetSettings(input)
    onWidgetSettingsChanged?.(settings.widget)

    return settings
  })
  ipcMain.handle('settings:updateStretching', (_event, input) => updateStretchingSettings(input))
}
