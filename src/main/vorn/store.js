import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, createReadStream, createWriteStream } from 'fs'
import { access, writeFile, truncate, open, unlink } from 'fs/promises'
import { join, basename } from 'path'
import { tmpdir } from 'os'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { createHash } from 'crypto'
import { readVornMeta, readVorn, writeVornFromSource, writeVornManifest, contentStream, VORN_HEADER_SIZE, VORN_SEPARATOR_LEN } from './format.js'
import { withFileLock } from './fileLock.js'
import { vornHash } from './hash.js'
import { CHUNK_THRESHOLD_BYTES, CHUNK_SIZE_BYTES, KNOWN_COMPRESSION_TYPES } from './constants.js'

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

function vorncPath(storeDir, storeKey) {
  return join(storeDir, storeKey + '.vornc')
}

export function ensureStore(storeDir) {
  if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true })
}

// ── Listing con cache in-memory ──────────────────────────────────────────────
// offset=0 forza il rebuild (usato dal pulsante refresh).

let _listCache = null // { dir: string, files: string[] }
let _metaCache = null // { dir: string, entries: Map<filename, fileInfo> }

export function invalidateListCache() { _listCache = null; _metaCache = null }

export function getCachedFileList(storeDir) {
  return _listCache?.dir === storeDir ? _listCache.files : null
}

function _getCachedMeta(storeDir, filename) {
  if (_metaCache?.dir !== storeDir) _metaCache = { dir: storeDir, entries: new Map() }
  if (_metaCache.entries.has(filename)) return _metaCache.entries.get(filename)
  const p = join(storeDir, filename)
  const st = statSync(p)
  let records = [], compressedType = null, content_hash = null
  try {
    const meta    = readVornMeta(p).meta
    records        = meta?.records        ?? []
    compressedType = meta?.compressedType ?? null
    content_hash   = meta?.hash_vorn      ?? null
  } catch { /* skip unreadable */ }
  const info = {
    hash_vorn: basename(filename, '.vorn'),
    content_hash, compressedType,
    bytes_file: st.size,
    ctime:      st.birthtimeMs,
    mtime:      st.mtimeMs,
    records,
  }
  _metaCache.entries.set(filename, info)
  return info
}

export function countStoreFiles(storeDir) {
  if (!existsSync(storeDir)) return 0
  return readdirSync(storeDir).filter(f => f.endsWith('.vorn') || f.endsWith('.vornc')).length
}

export function clearStore(storeDir) {
  if (!existsSync(storeDir)) return 0
  const files = readdirSync(storeDir).filter(f => f.endsWith('.vorn') || f.endsWith('.vornc'))
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
  const files = slice.map(f => _getCachedMeta(storeDir, f))

  return { files, total: pool.length }
}

// ── Helpers per il chunking ───────────────────────────────────────────────────

async function _writeChunkTemp(sourcePath, destPath, offset, length) {
  await pipeline(
    createReadStream(sourcePath, { start: offset, end: offset + length - 1 }),
    createWriteStream(destPath)
  )
}

async function _storeVornc(storeDir, chunkHash, chunkBytes, sourcePath, compressionType, manifestHash) {
  const key = toStoreKey(chunkHash, compressionType)
  const p   = vorncPath(storeDir, key)
  if (!existsSync(p)) {
    const meta = { hash_vorn: chunkHash, bytes: chunkBytes, compressedType: compressionType ?? null, references: [manifestHash] }
    await writeVornFromSource(p, meta, sourcePath, compressionType)
    return { key, isNew: true }
  }
  const { meta, contentLen } = readVornMeta(p)
  if (!meta.references) meta.references = []
  if (!meta.references.includes(manifestHash)) {
    meta.references.push(manifestHash)
    await _updateMeta(p, meta, contentLen)
  }
  return { key, isNew: false }
}

function _chunksStream(storeDir, chunkKeys) {
  async function* gen() {
    for (const key of chunkKeys) {
      const stream = contentStream(vorncPath(storeDir, key))
      for await (const buf of stream) yield buf
    }
  }
  return Readable.from(gen())
}

async function storeChunked(storeDir, hashVorn, bytes, sourcePath, sessionId, sessionName, relPath, compressionType, signal) {
  const manifestP = vornPath(storeDir, hashVorn)

  return withFileLock(manifestP, async () => {
    const exists = await access(manifestP).then(() => true).catch(() => false)

    if (exists) {
      const { meta, contentLen } = readVornMeta(manifestP)

      // Verifica e ripara chunk mancanti (usa compressionType dal meta, non dalla sessione)
      const metaComprType = meta.compressedType ?? null
      const chunks = meta.chunks ?? []
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunkKey = chunks[ci]
        if (!existsSync(vorncPath(storeDir, chunkKey))) {
          const offset        = ci * CHUNK_SIZE_BYTES
          const thisChunkSize = Math.min(CHUNK_SIZE_BYTES, meta.bytes - offset)
          const chunkHash     = chunkKey.split('_')[0]
          const chunkTmp      = join(tmpdir(), `vorn_c_${hashVorn}_${offset}.tmp`)
          try {
            await _writeChunkTemp(sourcePath, chunkTmp, offset, thisChunkSize)
            await _storeVornc(storeDir, chunkHash, thisChunkSize, chunkTmp, metaComprType, hashVorn)
          } finally {
            try { unlinkSync(chunkTmp) } catch { /* non-critico */ }
          }
        }
      }

      await _upsertRecord(manifestP, contentLen, meta, sessionId, sessionName, relPath)
      return { outcome: 'dedup', storeKey: hashVorn }
    }

    const chunkKeys  = []
    let chunksNew    = 0
    let chunksDedup  = 0
    let offset       = 0
    while (offset < bytes) {
      if (signal?.aborted) throw new Error('ERR_ABORTED')
      const thisChunkSize = Math.min(CHUNK_SIZE_BYTES, bytes - offset)
      const chunkTmp = join(tmpdir(), `vorn_c_${hashVorn}_${offset}.tmp`)
      try {
        await _writeChunkTemp(sourcePath, chunkTmp, offset, thisChunkSize)
        const chunkHash = vornHash(chunkTmp)
        const { key, isNew } = await _storeVornc(storeDir, chunkHash, thisChunkSize, chunkTmp, compressionType, hashVorn)
        chunkKeys.push(key)
        if (isNew) chunksNew++; else chunksDedup++
      } finally {
        try { unlinkSync(chunkTmp) } catch { /* non-critico */ }
      }
      offset += thisChunkSize
    }

    const meta = {
      strategy:      'chunks',
      hash_vorn:     hashVorn,
      bytes,
      compressedType: compressionType ?? null,
      chunks:        chunkKeys,
      records:       [{ id: sessionId, session: sessionName, paths: [relPath] }],
    }
    writeVornManifest(manifestP, meta)
    _listCache = null
    return { outcome: 'new', storeKey: hashVorn, chunks_new: chunksNew, chunks_dedup: chunksDedup }
  })
}

// ── Cerca qualsiasi .vorn esistente per questo hash (cross-strategy) ─────────
// Priorità: 1) hash.vorn (manifest chunks o plain)  2) hash_CT.vorn della sessione
//           3) tutti gli altri tipi noti (KNOWN_COMPRESSION_TYPES) — evita duplicati
function _findExistingVornKey(storeDir, hashVorn, compressionType) {
  // 1. Manifest chunked / plain — chiave base senza suffisso
  if (existsSync(vornPath(storeDir, hashVorn))) return hashVorn
  // 2. Blob compresso con il tipo della sessione corrente (priorità)
  if (compressionType) {
    const k = toStoreKey(hashVorn, compressionType)
    if (existsSync(vornPath(storeDir, k))) return k
  }
  // 3. Fallback: tutti gli altri tipi noti (cross-strategy dedup)
  for (const ct of KNOWN_COMPRESSION_TYPES) {
    if (ct === compressionType) continue
    const k = toStoreKey(hashVorn, ct)
    if (existsSync(vornPath(storeDir, k))) return k
  }
  return null
}

// ── Upsert record su un .vorn già esistente ───────────────────────────────────
async function _upsertRecord(p, contentLen, meta, sessionId, sessionName, relPath) {
  if (!meta.records) meta.records = []
  let changed = false
  const rec = meta.records.find(r => r.id === sessionId)
  if (rec) {
    if (!rec.paths.includes(relPath)) { rec.paths.push(relPath); changed = true }
  } else {
    meta.records.push({ id: sessionId, session: sessionName, paths: [relPath] }); changed = true
  }
  if (changed) await _updateMeta(p, meta, contentLen)
}

// ── Operazione atomica: check + create/upsert sotto lo stesso lock ────────────
// Ritorna 'new' se il file è stato creato, 'dedup' se già esisteva.
// Qualsiasi altro chiamante che arriva sullo stesso hash aspetta in coda.

export async function storeBlob(storeDir, hashVorn, bytes, sourcePath, sessionId, sessionName, relPath, compressionType = null, compTmpPath = null, compressedHash = null, signal = null, strategy = null) {
  ensureStore(storeDir)

  // ── Cerca un .vorn esistente per questo hash, indipendentemente dalla strategia ──
  const existingKey = _findExistingVornKey(storeDir, hashVorn, compressionType)

  if (existingKey !== null) {
    // Trovato: verifica integrità, ripara se necessario, upsert record
    const p = vornPath(storeDir, existingKey)
    return withFileLock(p, async () => {
      // Ricontrolla dentro il lock (potrebbe essere stato eliminato nel frattempo)
      if (!await access(p).then(() => true).catch(() => false)) {
        // Scomparso: rilascia e ricrea dalla strategia corrente
        return _createNew(storeDir, hashVorn, bytes, sourcePath, sessionId, sessionName, relPath, compressionType, compTmpPath, compressedHash, signal, strategy)
      }

      const { meta, contentLen } = readVornMeta(p)

      if (meta?.strategy === 'chunks') {
        // ── Verifica e ripara chunk mancanti ──
        const chunks = meta.chunks ?? []
        const metaComprType = meta.compressedType ?? null
        for (let ci = 0; ci < chunks.length; ci++) {
          const chunkKey = chunks[ci]
          if (!existsSync(vorncPath(storeDir, chunkKey))) {
            const offset        = ci * CHUNK_SIZE_BYTES
            const thisChunkSize = Math.min(CHUNK_SIZE_BYTES, meta.bytes - offset)
            const chunkHash     = chunkKey.split('_')[0]
            const chunkTmp      = join(tmpdir(), `vorn_c_${hashVorn}_${offset}.tmp`)
            try {
              await _writeChunkTemp(sourcePath, chunkTmp, offset, thisChunkSize)
              await _storeVornc(storeDir, chunkHash, thisChunkSize, chunkTmp, metaComprType, hashVorn)
            } finally {
              try { unlinkSync(chunkTmp) } catch { /* non-critico */ }
            }
          }
        }
      } else {
        // ── Verifica integrità blob: dimensione file deve coprire header + content ──
        const expectedMinSize = VORN_HEADER_SIZE + Number(contentLen) + VORN_SEPARATOR_LEN
        const actualSize = statSync(p).size
        if (actualSize < expectedMinSize) {
          // Blob corrotto: incorpora il record nella meta e riscrivi tutto in una sola passata.
          // Non usare _upsertRecord dopo: writeVornFromSource cambia la dimensione compressa
          // (non deterministica al 100%), quindi il contentLen letto prima non sarebbe più valido.
          const metaComprType = meta.compressedType ?? null
          if (!meta.records) meta.records = []
          const rec = meta.records.find(r => r.id === sessionId)
          if (rec) { if (!rec.paths.includes(relPath)) rec.paths.push(relPath) }
          else meta.records.push({ id: sessionId, session: sessionName, paths: [relPath] })
          await writeVornFromSource(p, meta, sourcePath, metaComprType, null, null, signal)
          _listCache = null
          return { outcome: 'dedup', storeKey: existingKey }
        }
      }

      await _upsertRecord(p, contentLen, meta, sessionId, sessionName, relPath)
      return { outcome: 'dedup', storeKey: existingKey }
    })
  }

  // ── Nessun .vorn esistente: crea da zero con la strategia corrente ─────────
  return _createNew(storeDir, hashVorn, bytes, sourcePath, sessionId, sessionName, relPath, compressionType, compTmpPath, compressedHash, signal, strategy)
}

async function _createNew(storeDir, hashVorn, bytes, sourcePath, sessionId, sessionName, relPath, compressionType, compTmpPath, compressedHash, signal, strategy) {
  if (strategy === 'chunks' && bytes >= CHUNK_THRESHOLD_BYTES)
    return storeChunked(storeDir, hashVorn, bytes, sourcePath, sessionId, sessionName, relPath, compressionType, signal)

  const key = toStoreKey(hashVorn, compressionType)
  const p   = vornPath(storeDir, key)

  return withFileLock(p, async () => {
    // Double-check: potrebbe essere stato creato da un altro worker nel frattempo
    if (await access(p).then(() => true).catch(() => false)) {
      const { meta, contentLen } = readVornMeta(p)
      await _upsertRecord(p, contentLen, meta, sessionId, sessionName, relPath)
      return { outcome: 'dedup', storeKey: key }
    }
    const meta = {
      hash_vorn:      hashVorn,
      bytes,
      compressedType: compressionType ?? null,
      records:        [{ id: sessionId, session: sessionName, paths: [relPath] }],
    }
    await writeVornFromSource(p, meta, sourcePath, compressionType, compTmpPath, compressedHash, signal)
    _listCache = null
    return { outcome: 'new', storeKey: key }
  })
}

export function deleteStoreEntry(storeDir, hashVorn) {
  const p = vornPath(storeDir, hashVorn)
  if (!existsSync(p)) throw new Error('ERR_ENTRY_NOT_FOUND')
  unlinkSync(p)
  if (_listCache) _listCache.files = _listCache.files.filter(f => f !== hashVorn + '.vorn')
  _metaCache?.entries.delete(hashVorn + '.vorn')
}

// ── Read-only (nessun lock necessario) ───────────────────────────────────────

export function getEntry(storeDir, hashVorn) {
  const p = vornPath(storeDir, hashVorn)
  if (!existsSync(p)) return null
  return readVornMeta(p).meta
}

export function extractContent(storeDir, storeKey) {
  const p = vornPath(storeDir, storeKey)
  const { meta } = readVornMeta(p)
  if (meta?.strategy === 'chunks') return _chunksStream(storeDir, meta.chunks)
  return contentStream(p)
}

export function readEntry(storeDir, hashVorn) {
  return readVorn(vornPath(storeDir, hashVorn))
}
