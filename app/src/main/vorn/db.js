import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const _dir  = join(homedir(), '.vorn')
const _path = join(_dir, 'vorn.db')

let _db = null

export function getDb() {
  if (_db) return _db
  mkdirSync(_dir, { recursive: true })
  _db = new Database(_path)
  _db.pragma('journal_mode = WAL')
  _db.pragma('synchronous = NORMAL')
  _db.exec(`
    CREATE TABLE IF NOT EXISTS Files (
      path    TEXT    PRIMARY KEY,
      mtime   INTEGER NOT NULL,
      size    INTEGER NOT NULL,
      hash    TEXT    NOT NULL,
      updated TEXT    NOT NULL
    )
  `)
  return _db
}

export function dbGetFile(path) {
  return getDb().prepare('SELECT * FROM Files WHERE path = ?').get(path)
}

export function dbUpsertFile(path, mtime, size, hash) {
  getDb().prepare(`
    INSERT INTO Files (path, mtime, size, hash, updated)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      mtime   = excluded.mtime,
      size    = excluded.size,
      hash    = excluded.hash,
      updated = excluded.updated
  `).run(path, mtime, size, hash, new Date().toISOString())
}
