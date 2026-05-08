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
let isQuittingAfterCvShutdown = false

function getPythonCommand() {
  return process.platform === 'win32' ? 'python' : 'python3'
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
  if (message.type === 'REALTIME_UPDATE') {
    lastRealtimePayload = message.payload
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

export function startCvProcess() {
  ensureCvProcess()
  return getCvStatus()
}

export function startCvCalibration() {
  sendCommand({ type: 'START_CALIB' })
  return { ok: true }
}

export function startCvPreview() {
  ensureCvProcess()
  return getCvStatus()
}

export function setCvSensitivity(value) {
  sendCommand({ type: 'SET_SENSITIVITY', value })
  return { ok: true }
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
    lastRealtimePayload
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
