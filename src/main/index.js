import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

import { initDB } from './database/db'
import { registerIpcHandlers } from './ipc/ipcRouter'
import { registerCvShutdown, stopCvProcess } from './controllers/cvController'
import { getWidgetSettings } from './controllers/settingsController'

let mainWindow = null
let calibrationWindow = null
let idleWindow = null
let calibrationCompleted = false

const WIDGET_BASE_WIDTH = 150
const WIDGET_BASE_HEIGHT = 250
const WIDGET_MARGIN = 22

function getRendererUrl(route = '') {
  if (is.dev) {
    return `http://localhost:5173${route}`
  }

  return null
}

function loadRenderer(window, route = '') {
  const rendererUrl = getRendererUrl(route)

  if (rendererUrl) {
    window.loadURL(rendererUrl)
    return
  }

  window.loadFile(join(__dirname, '../renderer/index.html'))
}

function applyWidgetSettingsToIdleWindow(widgetSettings = getWidgetSettings()) {
  if (!idleWindow || idleWindow.isDestroyed()) {
    return
  }

  const scale = widgetSettings.scale
  const width = Math.round(WIDGET_BASE_WIDTH * scale)
  const height = Math.round(WIDGET_BASE_HEIGHT * scale)
  const { workArea } = screen.getPrimaryDisplay()

  idleWindow.setSize(width, height)
  idleWindow.setPosition(
    workArea.x + workArea.width - width - WIDGET_MARGIN,
    workArea.y + workArea.height - height - WIDGET_MARGIN
  )
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 375,
    height: 812,
    minWidth: 360,
    minHeight: 640,
    useContentSize: true,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRenderer(mainWindow)
}

function createCalibrationWindow() {
  if (calibrationWindow) {
    calibrationWindow.focus()
    return
  }

  calibrationWindow = new BrowserWindow({
    width: 800,
    height: 640,
    minWidth: 640,
    minHeight: 520,
    useContentSize: true,
    resizable: true,
    parent: mainWindow ?? undefined,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  calibrationWindow.on('ready-to-show', () => {
    calibrationWindow.show()
  })

  calibrationWindow.on('closed', () => {
    calibrationWindow = null
    if (!calibrationCompleted) {
      void stopCvProcess()
    }
    mainWindow?.focus()
  })

  loadRenderer(calibrationWindow, '?screen=calibration')
}

function createIdleWindow() {
  if (idleWindow) {
    idleWindow.focus()
    return
  }

  const widgetSettings = getWidgetSettings()
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.round(WIDGET_BASE_WIDTH * widgetSettings.scale)
  const height = Math.round(WIDGET_BASE_HEIGHT * widgetSettings.scale)

  idleWindow = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    x: workArea.x + workArea.width - width - WIDGET_MARGIN,
    y: workArea.y + workArea.height - height - WIDGET_MARGIN,
    resizable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  idleWindow.on('ready-to-show', () => {
    idleWindow.show()
  })

  idleWindow.on('closed', () => {
    idleWindow = null
  })

  loadRenderer(idleWindow, '?screen=idle')
}

function registerWindowHandlers() {
  ipcMain.handle('window:openCalibration', () => {
    calibrationCompleted = false
    createCalibrationWindow()
    return { ok: true }
  })

  ipcMain.handle('window:completeCalibration', () => {
    calibrationCompleted = true
    mainWindow?.webContents.send('calibration:completed')
    calibrationWindow?.close()
    mainWindow?.hide()
    createIdleWindow()
    return { ok: true }
  })

  ipcMain.handle('window:openHome', () => {
    mainWindow?.show()
    mainWindow?.focus()
    return { ok: true }
  })
}

app.whenReady().then(() => {
  initDB()
  registerIpcHandlers({ onWidgetSettingsChanged: applyWidgetSettingsToIdleWindow })
  registerWindowHandlers()
  registerCvShutdown()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
