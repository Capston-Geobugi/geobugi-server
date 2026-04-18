import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db

function ensureDb() {
  if (!db) {
    throw new Error('Database has not been initialized. Call initDB() after app is ready.')
  }

  return db
}

function runMigrations(database) {
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')

  database.exec(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS calibrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shoulder_slope REAL NOT NULL,
      neck_forward_offset REAL NOT NULL,
      ear_width_ratio REAL NOT NULL DEFAULT 0,
      torso_tilt REAL NOT NULL,
      shoulder_center_y REAL,
      confidence REAL NOT NULL,
      sample_count INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posture_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calibration_id INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      total_duration_sec INTEGER NOT NULL DEFAULT 0,
      warning_count INTEGER NOT NULL DEFAULT 0,
      bad_event_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (calibration_id) REFERENCES calibrations(id)
    );

    CREATE TABLE IF NOT EXISTS posture_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('good', 'warning', 'bad')),
      issue_type TEXT,
      score REAL,
      neck_forward_offset REAL,
      shoulder_slope_delta REAL,
      torso_tilt_delta REAL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      triggered_feedback INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES posture_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stretching_missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      mission_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'skipped')),
      verification_mode TEXT NOT NULL CHECK (verification_mode IN ('manual', 'pose')),
      FOREIGN KEY (session_id) REFERENCES posture_sessions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_posture_sessions_started_at
      ON posture_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_posture_events_session_id
      ON posture_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_posture_events_started_at
      ON posture_events(started_at);
    CREATE INDEX IF NOT EXISTS idx_stretching_missions_started_at
      ON stretching_missions(started_at);
  `)

  const calibrationColumns = database
    .prepare("SELECT name FROM pragma_table_info('calibrations')")
    .all()
    .map((row) => row.name)

  if (!calibrationColumns.includes('ear_width_ratio')) {
    database.exec(
      'ALTER TABLE calibrations ADD COLUMN ear_width_ratio REAL NOT NULL DEFAULT 0'
    )
  }
}

export function initDB() {
  if (db) {
    return db
  }

  const dbPath = join(app.getPath('userData'), 'geobugi.sqlite')
  db = new Database(dbPath)
  runMigrations(db)

  return db
}

export function getDB() {
  return ensureDb()
}

export function withTransaction(callback) {
  let transaction

  return (...args) => {
    if (!transaction) {
      transaction = ensureDb().transaction(callback)
    }

    return transaction(...args)
  }
}
