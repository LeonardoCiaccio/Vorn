import { openSync, readSync, writeSync, closeSync, truncateSync, createReadStream, createWriteStream, statSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

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
  let fd = openSync(filePath, 'r')
  try {
    const contentLen = _getContentInfo(fd)
    const metaOffset = BigInt(HEADER_SIZE) + contentLen

    const sepBuf = Buffer.alloc(SEPARATOR.length)
    readSync(fd, sepBuf, 0, SEPARATOR.length, metaOffset)
    if (!sepBuf.equals(SEPARATOR)) throw new Error('Separator not found at expected position')

    const fileSize = statSync(filePath).size
    const metaSize = fileSize - Number(metaOffset) - SEPARATOR.length

    let meta = null
    if (metaSize > 0) {
      const metaBuf = Buffer.alloc(metaSize)
      readSync(fd, metaBuf, 0, metaSize, metaOffset + BigInt(SEPARATOR.length))
      try { meta = JSON.parse(metaBuf.toString('utf8')) } catch { /* WAL recovery below */ }
    }

    if (!meta) {
      // Metadati assenti o corrotti: tenta recovery dal file WAL
      const tmpPath = filePath + '.mtmp'
      if (!existsSync(tmpPath)) throw new Error('Metadata corrupted and no recovery file found')
      const recovered = JSON.parse(readFileSync(tmpPath, 'utf8'))
      closeSync(fd); fd = null
      const truncateAt = HEADER_SIZE + Number(contentLen) + SEPARATOR.length
      truncateSync(filePath, truncateAt)
      const recBuf = Buffer.from(JSON.stringify(recovered), 'utf8')
      const fdw = openSync(filePath, 'a')
      try { writeSync(fdw, recBuf) } finally { closeSync(fdw) }
      try { unlinkSync(tmpPath) } catch { /* non-critico */ }
      return readVornMeta(filePath)
    }

    return { meta, contentOffset: HEADER_SIZE, contentLen }
  } finally {
    if (fd !== null) try { closeSync(fd) } catch { /* già chiuso nel recovery */ }
  }
}

// ── Full read ─────────────────────────────────────────────────────────────────

export async function readVorn(filePath) {
  const { meta, contentLen } = readVornMeta(filePath)
  if (contentLen === 0n) return { meta, content: Buffer.alloc(0) }
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
  const stats      = statSync(sourcePath)
  const contentLen = BigInt(stats.size)

  const header = Buffer.alloc(HEADER_SIZE)
  MAGIC.copy(header)
  header.writeBigUInt64BE(contentLen, 4)

  const metaBuf = Buffer.from(JSON.stringify(meta), 'utf8')

  await pipeline(
    createReadStream(sourcePath),
    async function* (source) {
      yield header
      for await (const chunk of source) yield chunk
      yield SEPARATOR
      yield metaBuf
    },
    createWriteStream(destPath)
  )
}

// ── Surgical metadata update (truncate to separator, rewrite JSON) ───────────

export function updateVornMeta(filePath, meta) {
  const fd = openSync(filePath, 'r')
  let contentLen
  try { contentLen = _getContentInfo(fd) }
  finally { closeSync(fd) }

  const metaBuf  = Buffer.from(JSON.stringify(meta), 'utf8')
  const tmpPath  = filePath + '.mtmp'

  // Write-ahead: persiste il nuovo JSON prima di modificare l'originale
  writeFileSync(tmpPath, metaBuf)

  const truncateAt = HEADER_SIZE + Number(contentLen) + SEPARATOR.length
  truncateSync(filePath, truncateAt)

  const fdw = openSync(filePath, 'a')
  try { writeSync(fdw, metaBuf) }
  finally { closeSync(fdw) }

  try { unlinkSync(tmpPath) } catch { /* non-critico */ }
}

// ── Content stream (used by restore) ─────────────────────────────────────────

export function contentStream(filePath) {
  const { contentLen } = readVornMeta(filePath)
  if (contentLen === 0n) return Readable.from([])
  return createReadStream(filePath, {
    start: HEADER_SIZE,
    end: HEADER_SIZE + Number(contentLen) - 1
  })
}
