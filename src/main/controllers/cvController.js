import { BrowserWindow, app } from 'electron'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'

import { getDB } from '../database/db'

let cvProcess = null
let stdoutBuffer = ''
let activeSessionId = null
let lastRealtimePayload = null
let calibrationBaseline = null
let runtimeState = null
let cvReady = false
let cvReadyWaiters = []
let cvPauseWaiters = []
let isQuittingAfterCvShutdown = false

const MIN_USER_SENSITIVITY = 1
const MAX_USER_SENSITIVITY = 20

function getPythonCommand() {
  return process.platform === 'win32' ? 'python' : 'python3'
}

function toCvSensitivity(userSensitivity) {
  const numericValue = Number(userSensitivity)

  if (!Number.isFinite(numericValue)) {
    throw new Error('Sensitivity must be a number.')
  }

  const clampedValue = Math.min(
    MAX_USER_SENSITIVITY,
    Math.max(MIN_USER_SENSITIVITY, numericValue)
  )

  return MIN_USER_SENSITIVITY + MAX_USER_SENSITIVITY - clampedValue
}

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  })
}

function sendCvEvent(type, payload) {
  broadcast('cv:event', { type, payload })
}

function getCvScriptPath() {
  const candidates = [
    join(process.cwd(), 'cv', 'cv_main.py'),
    join(app.getAppPath(), 'cv', 'cv_main.py'),
    join(app.getPath('userData'), 'cv', 'cv_main.py')
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function normalizeTimestamp(timestamp) {
  if (!timestamp) {
    return new Date().toISOString()
  }

  return timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T')
}

function persistCvReport(report) {
  if (!Array.isArray(report?.data)) {
    return 0
  }

  const database = getDB()
  const insertSample = database.prepare(
    `
      INSERT INTO cv_posture_samples (
        session_id,
        measured_at,
        rep_value,
        raw_payload
      ) VALUES (?, ?, ?, ?)
    `
  )
  const insertSamples = database.transaction((samples) => {
    let savedCount = 0

    samples.forEach((sample) => {
      const repValue = Number(sample.rep_value)
      if (!Number.isFinite(repValue)) {
        return
      }

      insertSample.run(
        activeSessionId,
        normalizeTimestamp(sample.timestamp),
        repValue,
        JSON.stringify(sample)
      )
      savedCount += 1
    })

    return savedCount
  })

  const savedCount = insertSamples(report.data)
  return savedCount
}

function handleCvMessage(message) {
  if (message.type === 'STATUS' && message.payload === 'CV_READY') {
    cvReady = true
    cvReadyWaiters.forEach((resolve) => resolve(getCvStatus()))
    cvReadyWaiters = []
  }

  if (message.type === 'STATUS' && message.payload === 'PREVIEW_PAUSED') {
    cvPauseWaiters.forEach((resolve) => resolve(getCvStatus()))
    cvPauseWaiters = []
  }

  if (message.type === 'REALTIME_UPDATE') {
    lastRealtimePayload = message.payload
  }

  if (message.type === 'RUNTIME_STATE') {
    runtimeState = message.payload ?? null
  }

  if (message.type === 'CALIB_DONE') {
    calibrationBaseline = message.payload?.baseline ?? null
  }

  if (message.type === 'SESSION_DB_REPORT') {
    persistCvReport(message.payload)
  }

  broadcast('cv:event', message)
}

function handleStdoutChunk(chunk) {
  stdoutBuffer += chunk.toString()
  const lines = stdoutBuffer.split(/\r?\n/)
  stdoutBuffer = lines.pop() ?? ''

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }

    try {
      handleCvMessage(JSON.parse(trimmed))
    } catch {
      broadcast('cv:log', trimmed)
    }
  })
}

function ensureCvProcess() {
  if (cvProcess && !cvProcess.killed) {
    return cvProcess
  }

  const scriptPath = getCvScriptPath()
  cvProcess = spawn(getPythonCommand(), ['-u', scriptPath], {
    cwd: dirname(scriptPath),
    stdio: ['pipe', 'pipe', 'pipe']
  })

  cvProcess.stdout.setEncoding('utf8')
  cvProcess.stderr.setEncoding('utf8')
  cvProcess.stdout.on('data', handleStdoutChunk)

  cvProcess.stderr.on('data', (chunk) => {
    const message = chunk.toString().trim()
    broadcast('cv:error', message)
    sendCvEvent('ERROR', message)
  })

  cvProcess.on('close', (code) => {
    cvProcess = null
    stdoutBuffer = ''
    cvReady = false
    cvReadyWaiters.forEach((resolve) => resolve(getCvStatus()))
    cvReadyWaiters = []
    sendCvEvent('STATUS', { running: false, code })
  })

  sendCvEvent('STATUS', { running: true })
  return cvProcess
}

function sendCommand(command) {
  const processRef = ensureCvProcess()
  if (!processRef.stdin.writable) {
    throw new Error('CV process is not writable.')
  }

  processRef.stdin.write(`${JSON.stringify(command)}\n`)
}

function waitForCvReady(timeoutMs = 20000) {
  if (cvReady) {
    return Promise.resolve(getCvStatus())
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cvReadyWaiters = cvReadyWaiters.filter((waiter) => waiter !== finish)
      resolve(getCvStatus())
    }, timeoutMs)

    function finish(status) {
      clearTimeout(timeout)
      resolve(status)
    }

    cvReadyWaiters.push(finish)
  })
}

function waitForCvPause(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cvPauseWaiters = cvPauseWaiters.filter((waiter) => waiter !== finish)
      resolve(getCvStatus())
    }, timeoutMs)

    function finish(status) {
      clearTimeout(timeout)
      resolve(status)
    }

    cvPauseWaiters.push(finish)
  })
}

function getSavedCalibrationBaseline() {
  const row = getDB()
    .prepare(
      `
        SELECT neck_forward_offset
        FROM calibrations
        WHERE is_active = 1
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `
    )
    .get()
  const baseline = Number(row?.neck_forward_offset)

  return Number.isFinite(baseline) && baseline > 0 ? baseline : null
}

function getActiveUserSensitivity() {
  const row = getDB()
    .prepare(
      `
        SELECT user_sensitivity
        FROM sensitivity_modes
        WHERE is_active = 1
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `
    )
    .get()
  const userSensitivity = Number(row?.user_sensitivity)

  return Number.isFinite(userSensitivity) ? userSensitivity : null
}

function restoreRuntimeSettings() {
  const baseline = calibrationBaseline ?? getSavedCalibrationBaseline()

  if (baseline) {
    calibrationBaseline = baseline
    sendCommand({ type: 'SET_BASELINE', value: baseline })
  }

  if (runtimeState) {
    sendCommand({ type: 'SET_RUNTIME_STATE', value: runtimeState })
  }

  const userSensitivity = getActiveUserSensitivity()

  if (userSensitivity) {
    setCvSensitivity(userSensitivity)
  }
}

export function startCvProcess() {
  ensureCvProcess()
  return getCvStatus()
}

export async function prepareCvProcess() {
  ensureCvProcess()
  return waitForCvReady()
}

export function startCvCalibration() {
  sendCommand({ type: 'START_CALIB' })
  return { ok: true }
}

export function startCvPreview() {
  ensureCvProcess()
  restoreRuntimeSettings()
  sendCommand({ type: 'START_PREVIEW' })
  return getCvStatus()
}

export async function pauseCvMonitoring() {
  if (!cvProcess || cvProcess.killed) {
    return getCvStatus()
  }

  sendCommand({ type: 'PAUSE_MONITORING' })
  return waitForCvPause()
}

export function resumeCvMonitoring() {
  ensureCvProcess()
  restoreRuntimeSettings()
  sendCommand({ type: 'RESUME_MONITORING' })
  return getCvStatus()
}

export function setCvSensitivity(value) {
  const userSensitivity = Number(value)
  const cvSensitivity = toCvSensitivity(userSensitivity)

  sendCommand({ type: 'SET_SENSITIVITY', value: cvSensitivity })

  return { ok: true, userSensitivity, cvSensitivity }
}

export function attachCvSession(sessionId) {
  activeSessionId = sessionId ?? null
  return { ok: true }
}

export function getCvStatus() {
  return {
    running: Boolean(cvProcess),
    activeSessionId,
    calibrationBaseline,
    lastRealtimePayload,
    ready: cvReady
  }
}

export function stopCvProcess() {
  if (!cvProcess || cvProcess.killed) {
    return getCvStatus()
  }

  const processToStop = cvProcess

  return new Promise((resolve) => {
    const fallbackTimer = setTimeout(() => {
      if (cvProcess === processToStop) {
        processToStop.kill()
      }
    }, 3000)

    processToStop.once('close', () => {
      clearTimeout(fallbackTimer)
      resolve(getCvStatus())
    })

    if (processToStop.stdin.writable) {
      processToStop.stdin.write(`${JSON.stringify({ type: 'STOP_PROCESS' })}\n`)
    } else {
      processToStop.kill()
    }
  })
}

export function registerCvShutdown() {
  app.on('before-quit', (event) => {
    if (isQuittingAfterCvShutdown || !cvProcess) {
      return
    }

    event.preventDefault()
    void stopCvProcess().finally(() => {
      isQuittingAfterCvShutdown = true
      app.quit()
    })
  })
}
