import { openSync, readSync, writeSync, closeSync, createReadStream, createWriteStream, ftruncateSync, statSync } from 'fs'

const MAGIC = Buffer.from('VORN')
const SEPARATOR = Buffer.from([0xFF, 0x00, 0xFF, 0x00])
const HEADER_SIZE = 12 // 4 (VORN) + 8 (Length uint64)

// ── Internal: Get content info from the 12-byte header ────────────────────────

function _getContentInfo(fd) {
  const headerBuf = Buffer.alloc(HEADER_SIZE)
  const n = readSync(fd, headerBuf, 0, HEADER_SIZE, 0)
  if (n < HEADER_SIZE) throw new Error('File too small for VORN header')
  
  const magic = headerBuf.subarray(0, 4)
  if (!magic.equals(MAGIC)) throw new Error('Invalid VORN signature')
  
  // Read 64-bit Big-Endian length
  const contentLen = headerBuf.readBigUInt64BE(4)
  return contentLen
}

// ── Read metadata (from the tail) ─────────────────────────────────────────────

export function readVornMeta(filePath) {
  const fd = openSync(filePath, 'r')
  try {
    const contentLen = _getContentInfo(fd)
    const metaOffset = BigInt(HEADER_SIZE) + contentLen
    
    // Check separator
    const sepBuf = Buffer.alloc(SEPARATOR.length)
    readSync(fd, sepBuf, 0, SEPARATOR.length, metaOffset)
    if (!sepBuf.equals(SEPARATOR)) throw new Error('Separator not found at expected position')
    
    // Read the rest as JSON
    const stats = statSync(filePath)
    const metaSize = stats.size - Number(metaOffset) - SEPARATOR.length
    if (metaSize < 0) throw new Error('Invalid metadata size')
    
    const metaBuf = Buffer.alloc(metaSize)
    readSync(fd, metaBuf, 0, metaSize, metaOffset + BigInt(SEPARATOR.length))
    
    return {
      meta: JSON.parse(metaBuf.toString('utf8')),
      contentOffset: HEADER_SIZE,
      contentLen: contentLen
    }
  } finally {
    closeSync(fd)
  }
}

// ── Full read ─────────────────────────────────────────────────────────────────

export async function readVorn(filePath) {
  const { meta, contentLen } = readVornMeta(filePath)
  const rs = createReadStream(filePath, { start: HEADER_SIZE, end: HEADER_SIZE + Number(contentLen) - 1 })
  const chunks = []
  
  return new Promise((resolve, reject) => {
    rs.on('data', c => chunks.push(c))
    rs.on('end', () => resolve({ meta, content: Buffer.concat(chunks) }))
    rs.on('error', reject)
  })
}

// ── Write .vorn from source (initial creation) ───────────────────────────────

export async function writeVornFromSource(destPath, meta, sourcePath) {
  const stats = statSync(sourcePath)
  const contentLen = BigInt(stats.size)
  
  const header = Buffer.alloc(HEADER_SIZE)
  MAGIC.copy(header)
  header.writeBigUInt64BE(contentLen, 4)
  
  const metaBuf = Buffer.from(JSON.stringify(meta), 'utf8')
  
  return new Promise((resolve, reject) => {
    const ws = createWriteStream(destPath)
    const rs = createReadStream(sourcePath)
    
    ws.write(header)
    rs.pipe(ws, { end: false })
    
    rs.on('end', () => {
      ws.write(SEPARATOR)
      ws.write(metaBuf)
      ws.end()
    })
    
    ws.on('finish', resolve)
    ws.on('error', reject)
    rs.on('error', reject)
  })
}

// ── SURGICAL Update: Only touch the tail ─────────────────────────────────────

export function upsertPath(filePath, runTs, pathEntry, session, machine) {
  const fd = openSync(filePath, 'r+')
  try {
    const contentLen = _getContentInfo(fd)
    const metaOffset = BigInt(HEADER_SIZE) + contentLen
    
    // Verify separator
    const sepBuf = Buffer.alloc(SEPARATOR.length)
    readSync(fd, sepBuf, 0, SEPARATOR.length, metaOffset)
    if (!sepBuf.equals(SEPARATOR)) throw new Error('Integrity check failed: separator missing')
    
    // Read old meta
    const stats = statSync(filePath)
    const oldMetaSize = stats.size - Number(metaOffset) - SEPARATOR.length
    const oldMetaBuf = Buffer.alloc(oldMetaSize)
    readSync(fd, oldMetaBuf, 0, oldMetaSize, metaOffset + BigInt(SEPARATOR.length))
    const meta = JSON.parse(oldMetaBuf.toString('utf8'))
    
    // Update logic
    let updated = false
    for (const record of meta.records) {
      if (record.ts === runTs) {
        record.paths.push(pathEntry)
        updated = true
        break
      }
    }
    if (!updated) {
      meta.records.push({ ts: runTs, session, machine, paths: [pathEntry] })
    }
    
    const newMetaBuf = Buffer.from(JSON.stringify(meta), 'utf8')
    
    // CHIRURGIA: Truncate and Append
    ftruncateSync(fd, Number(metaOffset)) // Sottraiamo i vecchi meta
    writeSync(fd, SEPARATOR, 0, SEPARATOR.length, Number(metaOffset))
    writeSync(fd, newMetaBuf, 0, newMetaBuf.length, Number(metaOffset) + SEPARATOR.length) // Sommiamo i nuovi
    
  } finally {
    closeSync(fd)
  }
}

// ── Content stream (used by restore) ─────────────────────────────────────────

export function contentStream(filePath) {
  const { contentLen } = readVornMeta(filePath)
  return createReadStream(filePath, { 
    start: HEADER_SIZE, 
    end: HEADER_SIZE + Number(contentLen) - 1 
  })
}
