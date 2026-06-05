import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

import { initDB } from './database/db'
import { registerIpcHandlers } from './ipc/ipcRouter'
import { pauseCvMonitoring, registerCvShutdown } from './controllers/cvController'

let mainWindow = null
let calibrationWindow = null
let idleWindow = null
const postureBannerWindows = {
  bottom: null
}
let calibrationCompleted = false
let idleWindowPosition = null
let postureBannerAutoCloseTimer = null

const WIDGET_WINDOW_WIDTH_RATIO = 0.32
const WIDGET_WINDOW_HEIGHT_RATIO = 0.38
const WIDGET_MARGIN_RATIO = 0.012
const POSTURE_BANNER_HEIGHT = 44
const POSTURE_BANNER_AUTO_CLOSE_MS = 5 * 60 * 1000

function getAppIconPath() {
  if (is.dev) {
    return join(process.cwd(), 'resources/icon.png')
  }

  return join(process.resourcesPath, 'resources/icon.png')
}

function getWidgetWindowBounds() {
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.round(workArea.width * WIDGET_WINDOW_WIDTH_RATIO)
  const height = Math.round(workArea.height * WIDGET_WINDOW_HEIGHT_RATIO)
  const margin = Math.round(Math.min(workArea.width, workArea.height) * WIDGET_MARGIN_RATIO)
  const defaultBounds = {
    width,
    height,
    x: workArea.x + workArea.width - width - margin,
    y: workArea.y + workArea.height - height - margin
  }

  if (!idleWindowPosition) {
    return defaultBounds
  }

  return clampWidgetWindowBounds({
    ...defaultBounds,
    x: idleWindowPosition.x,
    y: idleWindowPosition.y
  })
}

function getPostureBannerWindowBounds(position = 'top') {
  const { workArea } = screen.getPrimaryDisplay()
  const y =
    position === 'bottom' ? workArea.y + workArea.height - POSTURE_BANNER_HEIGHT : workArea.y

  return {
    width: workArea.width,
    height: POSTURE_BANNER_HEIGHT,
    x: workArea.x,
    y
  }
}

function clampWidgetWindowBounds(bounds) {
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(bounds.width, workArea.width)
  const height = Math.min(bounds.height, workArea.height)
  const minX = workArea.x
  const minY = workArea.y
  const maxX = workArea.x + workArea.width - width
  const maxY = workArea.y + workArea.height - height

  return {
    width,
    height,
    x: Math.min(Math.max(Math.round(bounds.x), minX), maxX),
    y: Math.min(Math.max(Math.round(bounds.y), minY), maxY)
  }
}

function normalizeVisualInsets(input = {}, bounds) {
  const left = Number(input.left)
  const right = Number(input.right)
  const top = Number(input.top)
  const bottom = Number(input.bottom)

  return {
    left: Number.isFinite(left) ? Math.min(Math.max(left, 0), bounds.width) : 0,
    right: Number.isFinite(right) ? Math.min(Math.max(right, 0), bounds.width) : 0,
    top: Number.isFinite(top) ? Math.min(Math.max(top, 0), bounds.height) : 0,
    bottom: Number.isFinite(bottom) ? Math.min(Math.max(bottom, 0), bounds.height) : 0
  }
}

function clampWidgetWindowBoundsByVisualArea(bounds, visualInsets) {
  const { workArea } = screen.getPrimaryDisplay()
  const width = bounds.width
  const height = bounds.height
  const insets = normalizeVisualInsets(visualInsets, { width, height })
  const minX = workArea.x - insets.left
  const minY = workArea.y - insets.top
  const maxX = workArea.x + workArea.width - width + insets.right
  const maxY = workArea.y + workArea.height - height + insets.bottom

  return {
    width,
    height,
    x: Math.min(Math.max(Math.round(bounds.x), minX), maxX),
    y: Math.min(Math.max(Math.round(bounds.y), minY), maxY)
  }
}

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

function applyWidgetSettingsToIdleWindow() {
  if (!idleWindow || idleWindow.isDestroyed()) {
    return
  }

  const currentBounds = idleWindow.getBounds()
  const bounds = clampWidgetWindowBounds({
    ...getWidgetWindowBounds(),
    x: currentBounds.x,
    y: currentBounds.y
  })

  idleWindow.setBounds(bounds)
  idleWindowPosition = { x: bounds.x, y: bounds.y }
  keepIdleWindowOnTop()
}

function keepIdleWindowOnTop() {
  if (!idleWindow || idleWindow.isDestroyed()) {
    return
  }

  if (process.platform === 'darwin') {
    idleWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  try {
    idleWindow.setAlwaysOnTop(true, 'screen-saver')
  } catch {
    idleWindow.setAlwaysOnTop(true)
  }

  idleWindow.moveTop()
}

function keepPostureBannerWindowOnTop(window) {
  if (!window || window.isDestroyed()) {
    return
  }

  if (process.platform === 'darwin') {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  try {
    window.setAlwaysOnTop(true, 'screen-saver')
  } catch {
    window.setAlwaysOnTop(true)
  }

  window.moveTop()
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
    icon: getAppIconPath(),
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
    icon: getAppIconPath(),
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
      void pauseCvMonitoring()
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

  const bounds = getWidgetWindowBounds()

  idleWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    useContentSize: true,
    x: bounds.x,
    y: bounds.y,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    visibleOnAllWorkspaces: process.platform === 'darwin',
    skipTaskbar: true,
    show: false,
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  idleWindow.on('ready-to-show', () => {
    keepIdleWindowOnTop()
    idleWindow.show()
  })

  idleWindow.on('closed', () => {
    idleWindow = null
  })

  loadRenderer(idleWindow, '?screen=idle')
}

function createPostureBannerWindow(input = {}, position = 'top') {
  const bannerId = Number(input.id)
  const route = `?screen=posture-banner&id=${encodeURIComponent(bannerId)}&position=${position}`
  const currentWindow = postureBannerWindows[position]

  if (currentWindow && !currentWindow.isDestroyed()) {
    currentWindow.setBounds(getPostureBannerWindowBounds(position))
    loadRenderer(currentWindow, route)
    keepPostureBannerWindowOnTop(currentWindow)
    currentWindow.show()
    return { ok: true }
  }

  const bounds = getPostureBannerWindowBounds(position)

  const nextWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    useContentSize: true,
    x: bounds.x,
    y: bounds.y,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    visibleOnAllWorkspaces: process.platform === 'darwin',
    skipTaskbar: true,
    show: false,
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  postureBannerWindows[position] = nextWindow

  nextWindow.on('ready-to-show', () => {
    keepPostureBannerWindowOnTop(nextWindow)
    nextWindow.show()
  })

  nextWindow.on('closed', () => {
    if (postureBannerWindows[position] === nextWindow) {
      postureBannerWindows[position] = null
    }
  })

  loadRenderer(nextWindow, route)
  return { ok: true }
}

function createPostureBannerWindows(input = {}) {
  createPostureBannerWindow(input, 'bottom')
  schedulePostureBannerAutoClose()
  return { ok: true }
}

function schedulePostureBannerAutoClose() {
  clearTimeout(postureBannerAutoCloseTimer)
  postureBannerAutoCloseTimer = setTimeout(() => {
    postureBannerAutoCloseTimer = null
    closePostureBannerWindows({ clearTimer: false })
  }, POSTURE_BANNER_AUTO_CLOSE_MS)
}

function closePostureBannerWindows({ clearTimer = true } = {}) {
  if (clearTimer) {
    clearTimeout(postureBannerAutoCloseTimer)
    postureBannerAutoCloseTimer = null
  }

  Object.values(postureBannerWindows).forEach((window) => {
    window?.close()
  })
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

  ipcMain.handle('window:openIdle', () => {
    mainWindow?.hide()
    createIdleWindow()
    return { ok: true }
  })

  ipcMain.handle('window:openHome', () => {
    mainWindow?.show()
    mainWindow?.focus()
    return { ok: true }
  })

  ipcMain.handle('window:closeIdle', () => {
    idleWindow?.close()
    closePostureBannerWindows()
    return { ok: true }
  })

  ipcMain.handle('window:showPostureBanner', (_event, input = {}) => {
    return createPostureBannerWindows(input)
  })

  ipcMain.handle('window:closePostureBanner', () => {
    closePostureBannerWindows()
    return { ok: true }
  })

  ipcMain.handle('window:getIdleBounds', () => {
    if (!idleWindow || idleWindow.isDestroyed()) {
      return getWidgetWindowBounds()
    }

    return idleWindow.getBounds()
  })

  ipcMain.handle('window:moveIdle', (_event, input = {}) => {
    if (!idleWindow || idleWindow.isDestroyed()) {
      return { ok: false }
    }

    const currentBounds = idleWindow.getBounds()
    const requestedBounds = {
      ...currentBounds,
      x: Number(input.x ?? currentBounds.x),
      y: Number(input.y ?? currentBounds.y)
    }
    const nextBounds = input.visualInsets
      ? clampWidgetWindowBoundsByVisualArea(requestedBounds, input.visualInsets)
      : clampWidgetWindowBounds(requestedBounds)

    idleWindow.setBounds(nextBounds)
    idleWindowPosition = { x: nextBounds.x, y: nextBounds.y }
    return { ok: true, bounds: nextBounds }
  })

  ipcMain.handle('window:openStretching', () => {
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.webContents.send('app:navigate', 'stretching')
    return { ok: true }
  })

  ipcMain.handle('window:completeStretching', () => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send('stretching:completed')
      }
    })

    return { ok: true }
  })
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(getAppIconPath())
  }

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
