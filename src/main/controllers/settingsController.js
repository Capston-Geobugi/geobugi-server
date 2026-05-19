import { BrowserWindow } from 'electron'

import { getDB, withTransaction } from '../database/db'

const DEFAULT_SETTINGS = {
  widget: {
    opacity: 1,
    scale: 1
  },
  stretching: {
    intervalMinutes: 60
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function readNumberSetting(rowsByKey, key, fallback) {
  const value = Number(rowsByKey.get(key)?.value)

  return Number.isFinite(value) ? value : fallback
}

function writeSetting(database, key, value) {
  database
    .prepare(
      `
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `
    )
    .run(key, String(value))
}

function notifySettingsChanged(settings) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('settings:changed', settings)
    }
  })
}

function normalizeWidgetSettings(input) {
  const opacity = Number(input?.opacity)
  const scale = Number(input?.scale)

  if (!Number.isFinite(opacity) || !Number.isFinite(scale)) {
    throw new Error('Widget opacity and scale must be numbers.')
  }

  return {
    opacity: clamp(opacity, 0.3, 1),
    scale: clamp(scale, 0.7, 1.4)
  }
}

function normalizeStretchingInterval(value) {
  const intervalMinutes = Number(value)

  if (!Number.isFinite(intervalMinutes)) {
    throw new Error('Stretching interval must be a number.')
  }

  return clamp(Math.round(intervalMinutes), 10, 240)
}

export function getSettings() {
  const database = getDB()
  const rows = database.prepare('SELECT key, value FROM app_settings').all()
  const rowsByKey = new Map(rows.map((row) => [row.key, row]))

  return {
    widget: {
      opacity: readNumberSetting(
        rowsByKey,
        'widget.opacity',
        DEFAULT_SETTINGS.widget.opacity
      ),
      scale: readNumberSetting(rowsByKey, 'widget.scale', DEFAULT_SETTINGS.widget.scale)
    },
    stretching: {
      intervalMinutes: readNumberSetting(
        rowsByKey,
        'stretching.interval_minutes',
        DEFAULT_SETTINGS.stretching.intervalMinutes
      )
    }
  }
}

export function getWidgetSettings() {
  return getSettings().widget
}

const updateWidgetSettingsTransaction = withTransaction((input) => {
  const database = getDB()
  const widget = normalizeWidgetSettings(input)

  writeSetting(database, 'widget.opacity', widget.opacity)
  writeSetting(database, 'widget.scale', widget.scale)

  return getSettings()
})

export function updateWidgetSettings(input) {
  const settings = updateWidgetSettingsTransaction(input ?? {})
  notifySettingsChanged(settings)

  return settings
}

const updateStretchingSettingsTransaction = withTransaction((input) => {
  const database = getDB()
  const intervalMinutes = normalizeStretchingInterval(input?.intervalMinutes)

  writeSetting(database, 'stretching.interval_minutes', intervalMinutes)

  return getSettings()
})

export function updateStretchingSettings(input) {
  const settings = updateStretchingSettingsTransaction(input ?? {})
  notifySettingsChanged(settings)

  return settings
}
