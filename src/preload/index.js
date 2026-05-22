import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  calibration: {
    getActive: () => electronAPI.ipcRenderer.invoke('calibration:getActive'),
    start: () => electronAPI.ipcRenderer.invoke('calibration:start'),
    save: (input) => electronAPI.ipcRenderer.invoke('calibration:save', input)
  },
  session: {
    start: (input) => electronAPI.ipcRenderer.invoke('session:start', input),
    end: (input) => electronAPI.ipcRenderer.invoke('session:end', input),
    getCurrent: () => electronAPI.ipcRenderer.invoke('session:getCurrent')
  },
  posture: {
    logState: (input) => electronAPI.ipcRenderer.invoke('posture:logState', input),
    getRecent: (input) => electronAPI.ipcRenderer.invoke('posture:getRecent', input)
  },
  stretching: {
    createMission: (input) => electronAPI.ipcRenderer.invoke('stretching:createMission', input),
    completeMission: (input) => electronAPI.ipcRenderer.invoke('stretching:completeMission', input),
    skipMission: (input) => electronAPI.ipcRenderer.invoke('stretching:skipMission', input),
    getPending: () => electronAPI.ipcRenderer.invoke('stretching:getPending')
  },
  report: {
    getDaily: (input) => electronAPI.ipcRenderer.invoke('report:getDaily', input),
    getMonthly: (input) => electronAPI.ipcRenderer.invoke('report:getMonthly', input),
    getWeekly: (input) => electronAPI.ipcRenderer.invoke('report:getWeekly', input)
  },
  appWindow: {
    openCalibration: () => electronAPI.ipcRenderer.invoke('window:openCalibration'),
    completeCalibration: () => electronAPI.ipcRenderer.invoke('window:completeCalibration'),
    openHome: () => electronAPI.ipcRenderer.invoke('window:openHome'),
    onCalibrationCompleted: (callback) => {
      const listener = () => callback()
      ipcRenderer.on('calibration:completed', listener)

      return () => {
        ipcRenderer.removeListener('calibration:completed', listener)
      }
    }
  },
  cv: {
    start: () => electronAPI.ipcRenderer.invoke('cv:start'),
    prepare: () => electronAPI.ipcRenderer.invoke('cv:prepare'),
    startPreview: () => electronAPI.ipcRenderer.invoke('cv:startPreview'),
    startCalibration: () => electronAPI.ipcRenderer.invoke('cv:startCalibration'),
    pauseMonitoring: () => electronAPI.ipcRenderer.invoke('cv:pauseMonitoring'),
    resumeMonitoring: () => electronAPI.ipcRenderer.invoke('cv:resumeMonitoring'),
    stop: () => electronAPI.ipcRenderer.invoke('cv:stop'),
    getStatus: () => electronAPI.ipcRenderer.invoke('cv:getStatus'),
    attachSession: (sessionId) => electronAPI.ipcRenderer.invoke('cv:attachSession', sessionId),
    setSensitivity: (value) => electronAPI.ipcRenderer.invoke('cv:setSensitivity', value),
    onEvent: (callback) => {
      const listener = (_event, message) => callback(message)
      ipcRenderer.on('cv:event', listener)
      return () => ipcRenderer.removeListener('cv:event', listener)
    },
    onError: (callback) => {
      const listener = (_event, message) => callback(message)
      ipcRenderer.on('cv:error', listener)
      return () => ipcRenderer.removeListener('cv:error', listener)
    }
  },
  sensitivityMode: {
    list: () => electronAPI.ipcRenderer.invoke('sensitivityMode:list'),
    getActive: () => electronAPI.ipcRenderer.invoke('sensitivityMode:getActive'),
    create: (input) => electronAPI.ipcRenderer.invoke('sensitivityMode:create', input),
    update: (input) => electronAPI.ipcRenderer.invoke('sensitivityMode:update', input),
    delete: (input) => electronAPI.ipcRenderer.invoke('sensitivityMode:delete', input),
    activate: (input) => electronAPI.ipcRenderer.invoke('sensitivityMode:activate', input)
  },
  settings: {
    get: () => electronAPI.ipcRenderer.invoke('settings:get'),
    updateWidget: (input) => electronAPI.ipcRenderer.invoke('settings:updateWidget', input),
    updateStretching: (input) => electronAPI.ipcRenderer.invoke('settings:updateStretching', input),
    onChanged: (callback) => {
      const listener = (_event, settings) => callback(settings)
      ipcRenderer.on('settings:changed', listener)
      return () => ipcRenderer.removeListener('settings:changed', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
