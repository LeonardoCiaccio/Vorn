import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, basename } from 'path'
import { readVornMeta, readVorn, writeVornFromSource, upsertPath, contentStream } from './format.js'
import { withFileLock } from './fileLock.js'

function vornPath(storeDir, hashVorn) {
  return join(storeDir, hashVorn + '.vorn')
}

export function ensureStore(storeDir) {
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })
}

// ── Listing con cache in-memory ──────────────────────────────────────────────
// offset=0 forza il rebuild (usato dal pulsante refresh).

let _listCache = null // { dir: string, files: string[] }

export function countStoreFiles(storeDir) {
  if (!existsSync(storeDir)) return 0
  return readdirSync(storeDir).filter(f => f.endsWith('.vorn')).length
}

export function clearStore(storeDir) {
  if (!existsSync(storeDir)) return 0
  const files = readdirSync(storeDir).filter(f => f.endsWith('.vorn'))
  for (const f of files) unlinkSync(join(storeDir, f))
  _listCache = null
  return files.length
}

export function listStoreFiles(storeDir, offset = 0, limit = 20, matchHashes = null) {
  if (!existsSync(storeDir)) return { files: [], total: 0 }

  if (!_listCache || _listCache.dir !== storeDir || offset === 0) {
    const allFiles = readdirSync(storeDir)
      .filter(f => f.endsWith('.vorn'))
      .sort()
    _listCache = { dir: storeDir, files: allFiles }
  }

  const pool = matchHashes
    ? _listCache.files.filter(f => matchHashes.has(basename(f, '.vorn')))
    : _listCache.files

  const slice = pool.slice(offset, offset + limit)
  const files = slice.map(f => {
    const p = join(storeDir, f)
    const st = statSync(p)
    return {
      hash_vorn:  basename(f, '.vorn'),
      bytes_file: st.size,
      ctime:      st.birthtimeMs,
      mtime:      st.mtimeMs,
    }
  })

  return { files, total: pool.length }
}

// ── Operazione atomica: check + create/upsert sotto lo stesso lock ────────────
// Ritorna 'new' se il file è stato creato, 'dedup' se già esisteva.
// Qualsiasi altro chiamante che arriva sullo stesso hash aspetta in coda.

export async function createOrAddPath(storeDir, hashVorn, bytes, sourcePath, runTs, pathEntry, session, machine) {
  ensureStore(storeDir)
  const p = vornPath(storeDir, hashVorn)

  return withFileLock(p, async () => {
    if (existsSync(p)) {
      await upsertPath(p, runTs, pathEntry, session, machine)
      return 'dedup'
    }
    const meta = {
      hash_vorn: hashVorn,
      bytes,
      records: [{ ts: runTs, session, machine, paths: [pathEntry] }],
    }
    await writeVornFromSource(p, meta, sourcePath)
    return 'new'
  })
}

export function deleteStoreEntry(storeDir, hashVorn) {
  const p = vornPath(storeDir, hashVorn)
  if (!existsSync(p)) throw new Error(`Entry non trovata: ${hashVorn}`)
  unlinkSync(p)
  if (_listCache) _listCache.files = _listCache.files.filter(f => f !== hashVorn + '.vorn')
}

// ── Read-only (nessun lock necessario) ───────────────────────────────────────

export function getEntry(storeDir, hashVorn) {
  const p = vornPath(storeDir, hashVorn)
  if (!existsSync(p)) return null
  return readVornMeta(p).meta
}

export function extractContent(storeDir, hashVorn) {
  return contentStream(vornPath(storeDir, hashVorn))
}

export function readEntry(storeDir, hashVorn) {
  return readVorn(vornPath(storeDir, hashVorn))
}
