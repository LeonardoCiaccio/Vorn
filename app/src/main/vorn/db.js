import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

const _dbs = new Map()

export function openDb(dbPath) {
  if (_dbs.has(dbPath)) return _dbs.get(dbPath)
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  _migrate(db)
  _dbs.set(dbPath, db)
  return db
}

function _migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      name    TEXT PRIMARY KEY,
      store   TEXT NOT NULL,
      sources TEXT NOT NULL,
      ts      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      ts           TEXT NOT NULL,
      session_name TEXT NOT NULL REFERENCES sessions(name) ON DELETE CASCADE,
      machine      TEXT,
      status       TEXT NOT NULL DEFAULT 'running',
      duration_sec INTEGER DEFAULT 0,
      bytes_total  INTEGER DEFAULT 0,
      bytes_new    INTEGER DEFAULT 0,
      files_total  INTEGER DEFAULT 0,
      files_new    INTEGER DEFAULT 0,
      files_dedup  INTEGER DEFAULT 0,
      files_errors TEXT    DEFAULT '[]',
      PRIMARY KEY (ts, session_name)
    );

    CREATE TABLE IF NOT EXISTS run_files (
      session_name TEXT    NOT NULL,
      run_ts       TEXT    NOT NULL,
      rel_path     TEXT    NOT NULL,
      hash_vorn    TEXT    NOT NULL,
      source       TEXT    NOT NULL,
      bytes        INTEGER NOT NULL,
      mtime        INTEGER NOT NULL,
      permissions  TEXT    NOT NULL,
      PRIMARY KEY (session_name, run_ts, rel_path),
      FOREIGN KEY (session_name, run_ts) REFERENCES runs(session_name, ts) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_run_files ON run_files(session_name, run_ts);
  `)
}
