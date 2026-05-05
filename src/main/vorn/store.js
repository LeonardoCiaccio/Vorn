import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, openSync, writeSync, closeSync, truncateSync, writeFileSync, fsyncSync } from 'fs'
import { join, basename } from 'path'
import { readVornMeta, readVorn, writeVornFromSource, contentStream, VORN_HEADER_SIZE, VORN_SEPARATOR_LEN, readVornContentLen } from './format.js'
import { withFileLock } from './fileLock.js'

function _updateMeta(filePath, meta) {
  const contentLen = readVornContentLen(filePath)
  const metaBuf    = Buffer.from(JSON.stringify(meta), 'utf8')
  const tmpPath    = filePath + '.mtmp'

  writeFileSync(tmpPath, metaBuf) // WAL: esiste prima della modifica

  truncateSync(filePath, VORN_HEADER_SIZE + Number(contentLen) + VORN_SEPARATOR_LEN)

  const fdw = openSync(filePath, 'a')
  try {
    writeSync(fdw, metaBuf)
    fsyncSync(fdw) // flush su disco garantito prima di rimuovere il WAL
  } finally {
    closeSync(fdw)
  }

  try { unlinkSync(tmpPath) } catch { /* non-critico */ }
}

function vornPath(storeDir, hashVorn) {
  return join(storeDir, hashVorn + '.vorn')
}

export function ensureStore(storeDir) {
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })
}

// ── Listing con cache in-memory ──────────────────────────────────────────────
// offset=0 forza il rebuild (usato dal pulsante refresh).

let _listCache = null // { dir: string, files: string[] }

export function invalidateListCache() { _listCache = null }

export function getCachedFileList(storeDir) {
  return _listCache?.dir === storeDir ? _listCache.files : null
}

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
    let records = []
    try { records = readVornMeta(p).meta?.records ?? [] } catch { /* skip unreadable */ }
    return {
      hash_vorn:  basename(f, '.vorn'),
      bytes_file: st.size,
      ctime:      st.birthtimeMs,
      mtime:      st.mtimeMs,
      records,
    }
  })

  return { files, total: pool.length, _rawCache: _listCache.files }
}

// ── Operazione atomica: check + create/upsert sotto lo stesso lock ────────────
// Ritorna 'new' se il file è stato creato, 'dedup' se già esisteva.
// Qualsiasi altro chiamante che arriva sullo stesso hash aspetta in coda.

export async function storeBlob(storeDir, hashVorn, bytes, sourcePath, sessionId, sessionName, relPath) {
  ensureStore(storeDir)
  const p = vornPath(storeDir, hashVorn)

  return withFileLock(p, async () => {
    if (!existsSync(p)) {
      const meta = { hash_vorn: hashVorn, bytes, records: [{ id: sessionId, session: sessionName, paths: [relPath] }] }
      await writeVornFromSource(p, meta, sourcePath)
      _listCache = null
      return 'new'
    }

    const { meta } = readVornMeta(p)
    if (!meta.records) meta.records = []

    const rec = meta.records.find(r => r.id === sessionId)
    if (rec) {
      if (!rec.paths.includes(relPath)) {
        rec.paths.push(relPath)
        _updateMeta(p, meta)
      }
      // relPath già presente: nessuna I/O
    } else {
      meta.records.push({ id: sessionId, session: sessionName, paths: [relPath] })
      _updateMeta(p, meta)
    }
    return 'dedup'
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
