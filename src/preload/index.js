import { contextBridge } from 'electron'
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
    getWeekly: (input) => electronAPI.ipcRenderer.invoke('report:getWeekly', input)
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
