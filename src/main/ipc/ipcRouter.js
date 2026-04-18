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
import { getDailyReport, getWeeklyReport } from '../controllers/reportController'
import {
  completeMission,
  createMission,
  getPendingMissions,
  skipMission
} from '../controllers/stretchingController'

let handlersRegistered = false

export function registerIpcHandlers() {
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
  ipcMain.handle('report:getWeekly', (_event, input) => getWeeklyReport(input))
}
