import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { access, writeFile, truncate, open, unlink } from 'fs/promises'
import { join, basename } from 'path'
import { createHash } from 'crypto'
import { readVornMeta, readVorn, writeVornFromSource, contentStream, VORN_HEADER_SIZE, VORN_SEPARATOR_LEN } from './format.js'
import { withFileLock } from './fileLock.js'

function _walChecksum(metaJson) {
  return createHash('sha256').update(metaJson).digest('hex').slice(0, 16)
}

async function _updateMeta(filePath, meta, contentLen) {
  const metaJson = JSON.stringify(meta)
  const metaBuf  = Buffer.from(metaJson, 'utf8')
  const tmpPath  = filePath + '.mtmp'

  await writeFile(tmpPath, JSON.stringify({ meta, checksum: _walChecksum(metaJson) }))

  await truncate(filePath, VORN_HEADER_SIZE + Number(contentLen) + VORN_SEPARATOR_LEN)

  const fh = await open(filePath, 'a')
  try {
    await fh.write(metaBuf)
    await fh.sync() // flush asincrono: cede l'event loop durante l'attesa disco
  } finally {
    await fh.close()
  }

  try { await unlink(tmpPath) } catch { /* non-critico */ }
}

export function toStoreKey(hash, compressionType) {
  return compressionType ? `${hash}_${compressionType}` : hash
}

function vornPath(storeDir, storeKey) {
  return join(storeDir, storeKey + '.vorn')
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
    let records = [], compressedType = null, content_hash = null
    try {
      const meta    = readVornMeta(p).meta
      records        = meta?.records        ?? []
      compressedType = meta?.compressedType ?? null
      content_hash   = meta?.hash_vorn      ?? null
    } catch { /* skip unreadable */ }
    return {
      hash_vorn:      basename(f, '.vorn'),
      content_hash,
      compressedType,
      bytes_file:     st.size,
      ctime:          st.birthtimeMs,
      mtime:          st.mtimeMs,
      records,
    }
  })

  return { files, total: pool.length }
}

// ── Operazione atomica: check + create/upsert sotto lo stesso lock ────────────
// Ritorna 'new' se il file è stato creato, 'dedup' se già esisteva.
// Qualsiasi altro chiamante che arriva sullo stesso hash aspetta in coda.

export async function storeBlob(storeDir, hashVorn, bytes, sourcePath, sessionId, sessionName, relPath, compressionType = null, compTmpPath = null, compressedHash = null, signal = null) {
  ensureStore(storeDir)

  const key = toStoreKey(hashVorn, compressionType)
  const p   = vornPath(storeDir, key)

  return withFileLock(p, async () => {
    const pExists = await access(p).then(() => true).catch(() => false)
    if (!pExists) {
      const meta = {
        hash_vorn:       hashVorn,
        bytes,
        compressedType:  compressionType ?? null,
        records:         [{ id: sessionId, session: sessionName, paths: [relPath] }],
      }
      await writeVornFromSource(p, meta, sourcePath, compressionType, compTmpPath, compressedHash, signal)
      _listCache = null
      return { outcome: 'new', storeKey: key }
    }

    const { meta, contentLen } = readVornMeta(p)
    if (!meta.records) meta.records = []

    const rec = meta.records.find(r => r.id === sessionId)
    if (rec) {
      if (!rec.paths.includes(relPath)) {
        rec.paths.push(relPath)
        await _updateMeta(p, meta, contentLen)
      }
    } else {
      meta.records.push({ id: sessionId, session: sessionName, paths: [relPath] })
      await _updateMeta(p, meta, contentLen)
    }
    return { outcome: 'dedup', storeKey: key }
  })
}

export function deleteStoreEntry(storeDir, hashVorn) {
  const p = vornPath(storeDir, hashVorn)
  if (!existsSync(p)) throw new Error('ERR_ENTRY_NOT_FOUND')
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
