import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { logger } from './logger.js'

const _dir  = join(homedir(), '.vorn')
const _path = join(_dir, 'vorn.db')

let _db = null

export function getDb() {
  if (_db) return _db
  mkdirSync(_dir, { recursive: true })
  _db = new Database(_path)
  _db.pragma('journal_mode = WAL')
  _db.pragma('busy_timeout = 5000')
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

// Rimuove dal DB le path che non esistono più sul filesystem.
// Campiona 1000 record per rowid casuale (O(log n), nessuna full table scan)
// e raggruppa i DELETE in una transaction per efficienza.
export function closeDb() {
  if (_db) { _db.close(); _db = null }
}

export function dbPruneOrphans() {
  const db = getDb()
  const { maxId } = db.prepare('SELECT MAX(rowid) AS maxId FROM Files').get()
  if (!maxId) return 0

  const start = Math.floor(Math.random() * maxId)
  let rows = db.prepare('SELECT path FROM Files WHERE rowid >= ? LIMIT 1000').all(start)
  // Se l'offset è vicino alla fine della tabella integra dall'inizio
  if (rows.length < 1000) {
    const extra = db.prepare('SELECT path FROM Files WHERE rowid < ? LIMIT ?').all(start, 1000 - rows.length)
    rows = rows.concat(extra)
  }

  const del = db.prepare('DELETE FROM Files WHERE path = ?')
  let removed = 0
  try {
    db.transaction(() => {
      for (const { path } of rows) {
        if (!existsSync(path)) { del.run(path); removed++ }
      }
    })()
  } catch (e) {
    logger.warn(`dbPruneOrphans: transaction failed — ${e.message}`)
    removed = 0
  }
  return removed
}
