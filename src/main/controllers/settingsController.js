import { BrowserWindow } from 'electron'

import { getDB, withTransaction } from '../database/db'
import { getCurrentRemoteUserId } from './profileController'

const DEFAULT_SETTINGS = {
  widget: {
    opacity: 1,
    scale: 1,
    flipX: false
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

function readBooleanSetting(rowsByKey, key, fallback) {
  const value = rowsByKey.get(key)?.value

  if (value === '1' || value === 'true') {
    return true
  }

  if (value === '0' || value === 'false') {
    return false
  }

  return fallback
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

function getScopedSettingKey(key, remoteUserId = getCurrentRemoteUserId()) {
  return remoteUserId ? `user.${remoteUserId}.${key}` : key
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
    scale: clamp(scale, 1, 1.4),
    flipX: Boolean(input?.flipX)
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
  const remoteUserId = getCurrentRemoteUserId()
  const rows = database.prepare('SELECT key, value FROM app_settings').all()
  const rowsByKey = new Map(rows.map((row) => [row.key, row]))

  function readUserNumberSetting(key, fallback) {
    return readNumberSetting(rowsByKey, getScopedSettingKey(key, remoteUserId), fallback)
  }

  function readUserBooleanSetting(key, fallback) {
    return readBooleanSetting(rowsByKey, getScopedSettingKey(key, remoteUserId), fallback)
  }

  return {
    widget: {
      opacity: readUserNumberSetting('widget.opacity', DEFAULT_SETTINGS.widget.opacity),
      scale: readUserNumberSetting('widget.scale', DEFAULT_SETTINGS.widget.scale),
      flipX: readUserBooleanSetting('widget.flip_x', DEFAULT_SETTINGS.widget.flipX)
    },
    stretching: {
      intervalMinutes: readUserNumberSetting(
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

  writeSetting(database, getScopedSettingKey('widget.opacity'), widget.opacity)
  writeSetting(database, getScopedSettingKey('widget.scale'), widget.scale)
  writeSetting(database, getScopedSettingKey('widget.flip_x'), widget.flipX ? '1' : '0')

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

  writeSetting(database, getScopedSettingKey('stretching.interval_minutes'), intervalMinutes)

  return getSettings()
})

export function updateStretchingSettings(input) {
  const settings = updateStretchingSettingsTransaction(input ?? {})
  notifySettingsChanged(settings)

  return settings
}
