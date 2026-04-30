import { openSync, readSync, closeSync, createReadStream, createWriteStream, renameSync, unlinkSync, existsSync } from 'fs'

// Binary separator: "VORN" + FF 00 FF 00 — impossible in valid UTF-8 JSON
const SEPARATOR = Buffer.from([0x56, 0x4F, 0x52, 0x4E, 0xFF, 0x00, 0xFF, 0x00])

// ── Header-only read (no content loaded into memory) ──────────────────────────

export function readVornMeta(filePath) {
  const fd = openSync(filePath, 'r')
  const chunks = []
  const chunk  = Buffer.alloc(4096)
  let pos    = 0
  let sepPos = -1

  try {
    while (sepPos === -1) {
      const n = readSync(fd, chunk, 0, chunk.length, pos)
      if (n === 0) break
      chunks.push(Buffer.from(chunk.slice(0, n)))
      pos += n
      sepPos = findSeparator(Buffer.concat(chunks))
      if (pos > 2 * 1024 * 1024) break  // header cap at 2 MB
    }
  } finally {
    closeSync(fd)
  }

  if (sepPos === -1) throw new Error(`Invalid .vorn: separator not found in ${filePath}`)
  const combined = Buffer.concat(chunks)
  return {
    meta:          JSON.parse(combined.slice(0, sepPos).toString('utf8')),
    contentOffset: sepPos + SEPARATOR.length,
  }
}

// ── Full read (used only for small files / inspect / restore) ─────────────────

export function readVorn(filePath) {
  const { meta, contentOffset } = readVornMeta(filePath)
  const rs      = createReadStream(filePath, { start: contentOffset })
  const chunks  = []
  return new Promise((resolve, reject) => {
    rs.on('data',  c  => chunks.push(c))
    rs.on('end',   () => resolve({ meta, content: Buffer.concat(chunks) }))
    rs.on('error', reject)
  })
}

// ── Write .vorn by streaming source file (no full-file buffer in memory) ──────

export function writeVornFromSource(destPath, meta, sourcePath) {
  const header  = Buffer.from(JSON.stringify(meta), 'utf8')
  const tmpPath = destPath + '.tmp'
  _cleanTmp(tmpPath)

  return new Promise((resolve, reject) => {
    const ws = createWriteStream(tmpPath)
    const rs = createReadStream(sourcePath)

    ws.write(header)
    ws.write(SEPARATOR)
    rs.pipe(ws)

    ws.on('finish', () => {
      try { renameSync(tmpPath, destPath); resolve() }
      catch (e) { reject(e) }
    })
    ws.on('error', e => { _cleanTmp(tmpPath); reject(e) })
    rs.on('error', e => { _cleanTmp(tmpPath); reject(e) })
  })
}

// ── Update only the header of an existing .vorn (stream content through) ──────

export function upsertPath(filePath, runTs, pathEntry, session, machine) {
  const { meta, contentOffset } = readVornMeta(filePath)

  const existing = meta.records.find(r => r.ts === runTs)
  if (existing) existing.paths.push(pathEntry)
  else meta.records.push({ ts: runTs, session, machine, paths: [pathEntry] })

  const newHeader = Buffer.from(JSON.stringify(meta), 'utf8')
  const tmpPath   = filePath + '.tmp'
  _cleanTmp(tmpPath)

  return new Promise((resolve, reject) => {
    const ws = createWriteStream(tmpPath)
    const rs = createReadStream(filePath, { start: contentOffset })

    ws.write(newHeader)
    ws.write(SEPARATOR)
    rs.pipe(ws)

    ws.on('finish', () => {
      try { renameSync(tmpPath, filePath); resolve() }
      catch (e) { reject(e) }
    })
    ws.on('error', e => { _cleanTmp(tmpPath); reject(e) })
    rs.on('error', e => { _cleanTmp(tmpPath); reject(e) })
  })
}

// ── Content stream (used by restore) ─────────────────────────────────────────

export function contentStream(filePath) {
  const { contentOffset } = readVornMeta(filePath)
  return createReadStream(filePath, { start: contentOffset })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findSeparator(buf) {
  outer: for (let i = 0; i <= buf.length - SEPARATOR.length; i++) {
    for (let j = 0; j < SEPARATOR.length; j++) {
      if (buf[i + j] !== SEPARATOR[j]) continue outer
    }
    return i
  }
  return -1
}

function _cleanTmp(p) {
  try { if (existsSync(p)) unlinkSync(p) } catch { /* ignore */ }
}
