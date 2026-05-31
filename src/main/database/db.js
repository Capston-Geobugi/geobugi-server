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
      remote_user_id TEXT,
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

    CREATE TABLE IF NOT EXISTS cv_posture_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      measured_at TEXT NOT NULL,
      rep_value REAL NOT NULL,
      raw_payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES posture_sessions(id) ON DELETE SET NULL
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

    CREATE TABLE IF NOT EXISTS sensitivity_modes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      user_sensitivity INTEGER NOT NULL CHECK (user_sensitivity BETWEEN 1 AND 20),
      is_active INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_posture_sessions_started_at
      ON posture_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_posture_events_session_id
      ON posture_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_posture_events_started_at
      ON posture_events(started_at);
    CREATE INDEX IF NOT EXISTS idx_cv_posture_samples_session_id
      ON cv_posture_samples(session_id);
    CREATE INDEX IF NOT EXISTS idx_cv_posture_samples_measured_at
      ON cv_posture_samples(measured_at);
    CREATE INDEX IF NOT EXISTS idx_stretching_missions_started_at
      ON stretching_missions(started_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sensitivity_modes_active
      ON sensitivity_modes(is_active)
      WHERE is_active = 1;
  `)

  const sensitivityModeCount = database
    .prepare('SELECT COUNT(*) AS count FROM sensitivity_modes')
    .get().count

  if (sensitivityModeCount === 0) {
    database
      .prepare(
        `
          INSERT INTO sensitivity_modes (
            name,
            user_sensitivity,
            is_active,
            is_default
          ) VALUES ('기본 모드', 10, 1, 1)
        `
      )
      .run()
  }

  const insertSetting = database.prepare(
    `
      INSERT OR IGNORE INTO app_settings (key, value)
      VALUES (?, ?)
    `
  )

  insertSetting.run('widget.opacity', '1')
  insertSetting.run('widget.scale', '1')
  insertSetting.run('stretching.interval_minutes', '60')

  const activeSensitivityMode = database
    .prepare('SELECT id FROM sensitivity_modes WHERE is_active = 1 LIMIT 1')
    .get()

  if (!activeSensitivityMode) {
    database
      .prepare(
        `
          UPDATE sensitivity_modes
          SET is_active = 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = (
            SELECT id
            FROM sensitivity_modes
            ORDER BY is_default DESC, created_at ASC, id ASC
            LIMIT 1
          )
        `
      )
      .run()
  }

  const calibrationColumns = database
    .prepare("SELECT name FROM pragma_table_info('calibrations')")
    .all()
    .map((row) => row.name)

  if (!calibrationColumns.includes('ear_width_ratio')) {
    database.exec('ALTER TABLE calibrations ADD COLUMN ear_width_ratio REAL NOT NULL DEFAULT 0')
  }

  const userProfileColumns = database
    .prepare("SELECT name FROM pragma_table_info('user_profile')")
    .all()
    .map((row) => row.name)

  if (!userProfileColumns.includes('remote_user_id')) {
    database.exec('ALTER TABLE user_profile ADD COLUMN remote_user_id TEXT')
  }

  const cvSampleSessionColumn = database
    .prepare("SELECT * FROM pragma_table_info('cv_posture_samples')")
    .all()
    .find((row) => row.name === 'session_id')

  if (cvSampleSessionColumn?.notnull) {
    database.exec(`
      ALTER TABLE cv_posture_samples RENAME TO cv_posture_samples_old;

      CREATE TABLE cv_posture_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        measured_at TEXT NOT NULL,
        rep_value REAL NOT NULL,
        raw_payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES posture_sessions(id) ON DELETE SET NULL
      );

      INSERT INTO cv_posture_samples (
        id,
        session_id,
        measured_at,
        rep_value,
        raw_payload,
        created_at
      )
      SELECT
        id,
        session_id,
        measured_at,
        rep_value,
        raw_payload,
        created_at
      FROM cv_posture_samples_old;

      DROP TABLE cv_posture_samples_old;
    `)

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_cv_posture_samples_session_id
        ON cv_posture_samples(session_id);
      CREATE INDEX IF NOT EXISTS idx_cv_posture_samples_measured_at
        ON cv_posture_samples(measured_at);
    `)
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
