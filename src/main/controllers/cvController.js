import { BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'

let cvProcess = null

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload)
  })
}

function getCvScriptPath() {
  return join(process.cwd(), 'cv', 'cv_main.py')
}

function ensureCvProcess() {
  if (cvProcess && !cvProcess.killed) {
    return cvProcess
  }

  const scriptPath = getCvScriptPath()
  cvProcess = spawn('python3', ['-u', scriptPath], {
    cwd: join(process.cwd(), 'cv'),
    stdio: ['pipe', 'pipe', 'pipe']
  })

  cvProcess.stdout.setEncoding('utf8')
  cvProcess.stderr.setEncoding('utf8')

  cvProcess.stdout.on('data', (chunk) => {
    chunk
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => {
        try {
          const message = JSON.parse(line)
          broadcast('cv:event', message)
        } catch {
          broadcast('cv:log', line)
        }
      })
  })

  cvProcess.stderr.on('data', (chunk) => {
    broadcast('cv:error', chunk)
  })

  cvProcess.on('exit', (code) => {
    broadcast('cv:event', {
      type: 'LOG',
      payload: `CV process exited with code ${code}`
    })
    cvProcess = null
  })

  return cvProcess
}

function sendCommand(command) {
  const processRef = ensureCvProcess()
  processRef.stdin.write(`${JSON.stringify(command)}\n`)
}

export function startCvCalibration() {
  sendCommand({ type: 'START_CALIB' })
  return { ok: true }
}

export function startCvPreview() {
  ensureCvProcess()
  return { ok: true }
}

export function setCvSensitivity(value) {
  sendCommand({ type: 'SET_SENSITIVITY', value })
  return { ok: true }
}

export function stopCvProcess() {
  if (cvProcess && !cvProcess.killed) {
    cvProcess.kill()
  }

  cvProcess = null
  return { ok: true }
}
