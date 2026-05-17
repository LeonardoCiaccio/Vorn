import Database from 'better-sqlite3'
import { safeExistsSync, safeMkdirSync } from './safeFs.js'
import { join } from 'path'
import { homedir } from 'os'
import { logger } from './logger.js'

const _dir  = join(homedir(), '.vorn')
const _path = join(_dir, 'vorn.db')

let _db = null

export function getDb() {
  if (_db) return _db
  if (!safeExistsSync(_dir)) safeMkdirSync(_dir, { recursive: true })
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

export function dbUpsertFileMany(records) {
  if (!records.length) return
  const db   = getDb()
  const stmt = db.prepare(`
    INSERT INTO Files (path, mtime, size, hash, updated)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      mtime   = excluded.mtime,
      size    = excluded.size,
      hash    = excluded.hash,
      updated = excluded.updated
  `)
  const now = new Date().toISOString()
  db.transaction(() => {
    for (const { path, mtime, size, hash } of records)
      stmt.run(path, mtime, size, hash, now)
  })()
}

export function closeDb() {
  if (_db) { _db.close(); _db = null }
}

// Cursor sliding (in-memory, persiste tra invocazioni nello stesso processo).
// Sostituisce il vecchio random sampling, che dopo delete massivi lasciava
// migliaia di entry stale a vita perché il random poteva non toccarle MAI.
// Con il cursore, in al più ⌈maxId/1000⌉ cicli di backup l'intero DB viene
// passato in rassegna. All'avvio dell'app riparte da 0, ma è accettabile:
// 1000 record/run × frequenza tipica = copertura completa in poche sessioni.
let _pruneCursor = 0

// Rimuove dal DB le path che non esistono più sul filesystem.
// Esamina 1000 record consecutivi a partire da `_pruneCursor`; al wraparound
// azzera. DELETE raggruppati in una transaction per efficienza.
export function dbPruneOrphans() {
  const db = getDb()
  const { maxId } = db.prepare('SELECT MAX(rowid) AS maxId FROM Files').get()
  if (!maxId) return 0

  if (_pruneCursor >= maxId) _pruneCursor = 0
  const start = _pruneCursor
  let rows = db.prepare('SELECT path FROM Files WHERE rowid >= ? LIMIT 1000').all(start)
  // Se la finestra è vicina alla fine della tabella, integra dall'inizio
  if (rows.length < 1000) {
    const extra = db.prepare('SELECT path FROM Files WHERE rowid < ? LIMIT ?').all(start, 1000 - rows.length)
    rows = rows.concat(extra)
  }
  _pruneCursor = start + 1000

  const del = db.prepare('DELETE FROM Files WHERE path = ?')
  let removed = 0
  try {
    db.transaction(() => {
      for (const { path } of rows) {
        if (!safeExistsSync(path)) { del.run(path); removed++ }
      }
    })()
  } catch (e) {
    logger.warn(`dbPruneOrphans: transaction failed — ${e.message}`)
    removed = 0
  }
  return removed
}
