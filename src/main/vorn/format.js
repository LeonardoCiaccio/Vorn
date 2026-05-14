import { openSync, readSync, writeSync, fsyncSync, closeSync, truncateSync, createReadStream, createWriteStream, statSync, existsSync, readFileSync, unlinkSync, renameSync } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { createHash } from 'crypto'
import { compressToTemp, decompressStream, cleanupTemp } from './compress.js'
import { vornHash } from './hash.js'
import { safeCreateReadStream } from './safeFs.js'
import { logger } from './logger.js'

function _walChecksum(metaJson) {
  return createHash('sha256').update(metaJson).digest('hex').slice(0, 16)
}

const MAGIC = Buffer.from('VORN')
const SEPARATOR = Buffer.from([0xFF, 0x00, 0xFF, 0x00])
const HEADER_SIZE = 12 // 4 (VORN) + 8 (Length uint64)

export const VORN_HEADER_SIZE   = HEADER_SIZE
export const VORN_SEPARATOR_LEN = SEPARATOR.length

export function readVornContentLen(filePath) {
  const fd = openSync(filePath, 'r')
  try { return _getContentInfo(fd) }
  finally { closeSync(fd) }
}

// ── Interno: legge le informazioni di contenuto dall'header a 12 byte ─────────

function _getContentInfo(fd) {
  const headerBuf = Buffer.alloc(HEADER_SIZE)
  const n = readSync(fd, headerBuf, 0, HEADER_SIZE, 0)
  if (n < HEADER_SIZE) throw new Error('ERR_FILE_TOO_SMALL')

  const magic = headerBuf.subarray(0, 4)
  if (!magic.equals(MAGIC)) throw new Error('ERR_INVALID_VORN_SIGNATURE')

  // Lunghezza a 64 bit Big-Endian
  const contentLen = headerBuf.readBigUInt64BE(4)
  return contentLen
}

// ── Lettura metadati (in coda al file) ────────────────────────────────────────

export function readVornMeta(filePath) {
  let fd = openSync(filePath, 'r')
  try {
    const contentLen = _getContentInfo(fd)
    const metaOffset = BigInt(HEADER_SIZE) + contentLen

    const sepBuf = Buffer.alloc(SEPARATOR.length)
    readSync(fd, sepBuf, 0, SEPARATOR.length, metaOffset)
    if (!sepBuf.equals(SEPARATOR)) throw new Error('ERR_SEPARATOR_NOT_FOUND')

    const fileSize = statSync(filePath).size
    const metaSize = fileSize - Number(metaOffset) - SEPARATOR.length

    let meta = null
    if (metaSize > 0) {
      const metaBuf = Buffer.alloc(metaSize)
      readSync(fd, metaBuf, 0, metaSize, metaOffset + BigInt(SEPARATOR.length))
      try { meta = JSON.parse(metaBuf.toString('utf8')) } catch { /* WAL recovery below */ }
    }

    if (!meta) {
      const tmpPath = filePath + '.mtmp'
      if (!existsSync(tmpPath)) throw new Error('ERR_METADATA_CORRUPT')
      let recovered
      try {
        const walData = JSON.parse(readFileSync(tmpPath, 'utf8'))
        if (walData.checksum !== undefined) {
          const expected = createHash('sha256').update(JSON.stringify(walData.meta)).digest('hex').slice(0, 16)
          if (walData.checksum !== expected) throw new Error('ERR_WAL_INVALID')
          recovered = walData.meta
        } else {
          recovered = walData
        }
      } catch (e) {
        throw new Error(e.message === 'ERR_WAL_INVALID' ? 'ERR_WAL_INVALID' : 'ERR_WAL_INVALID')
      }
      closeSync(fd); fd = null
      const truncateAt = HEADER_SIZE + Number(contentLen) + SEPARATOR.length
      truncateSync(filePath, truncateAt)
      const recBuf = Buffer.from(JSON.stringify(recovered), 'utf8')
      const fdw = openSync(filePath, 'a')
      try { writeSync(fdw, recBuf); fsyncSync(fdw) } finally { closeSync(fdw) }
      try { unlinkSync(tmpPath) } catch { /* non-critico */ }
      return readVornMeta(filePath)
    }

    return { meta, contentOffset: HEADER_SIZE, contentLen }
  } finally {
    if (fd !== null) try { closeSync(fd) } catch { /* già chiuso nel recovery */ }
  }
}

// ── Lettura completa ──────────────────────────────────────────────────────────

const READ_VORN_MAX_BYTES = 128 * 1024 * 1024 // 128 MB — prevenzione OOM

export async function readVorn(filePath) {
  const { meta, contentLen } = readVornMeta(filePath)
  if (contentLen === 0n) return { meta, content: Buffer.alloc(0) }
  if (contentLen > BigInt(READ_VORN_MAX_BYTES))
    throw new Error('ERR_FILE_TOO_LARGE')
  const stream = contentStream(filePath)
  const chunks = []
  return new Promise((resolve, reject) => {
    stream.on('data', c => chunks.push(c))
    stream.on('end', () => resolve({ meta, content: Buffer.concat(chunks) }))
    stream.on('error', reject)
  })
}

// ── Scrittura .vorn da sorgente (creazione iniziale) ─────────────────────────

export async function writeVornFromSource(destPath, meta, sourcePath, compressionType = null, precompressedPath = null, precompressedHash = null) {
  const tmpPath = destPath + '.tmp'
  const t0 = Date.now()
  logger.info(`[writeVorn] START  src="${sourcePath}" compression=${compressionType ?? 'none'} precompressed=${!!precompressedPath}`)

  let contentLen
  let contentSource
  let ownedCtmp = null // file ctmp creato qui (da pulire nel finally)

  if (compressionType) {
    if (precompressedPath) {
      // Già compresso nel backupWorker — il Main Process non fa lavoro pesante
      contentLen            = BigInt(statSync(precompressedPath).size)
      contentSource         = precompressedPath
      meta.compressed_hash  = precompressedHash
      meta.bytes_compressed = Number(contentLen)
      logger.info(`[writeVorn] PRECOMPRESSED contentLen=${contentLen} (${Date.now() - t0}ms)`)
    } else {
      // Fallback (chiamate non provenienti dal backup, es. test o uso diretto)
      ownedCtmp = destPath + '.ctmp'
      try {
        logger.info(`[writeVorn] COMPRESS start (${Date.now() - t0}ms)`)
        const compressedSize = await compressToTemp(sourcePath, ownedCtmp, compressionType)
        logger.info(`[writeVorn] COMPRESS done compressedSize=${compressedSize} (${Date.now() - t0}ms)`)
        contentLen            = BigInt(compressedSize)
        contentSource         = ownedCtmp
        meta.compressed_hash  = vornHash(ownedCtmp)
        meta.bytes_compressed = compressedSize
      } catch (e) {
        logger.error(`[writeVorn] COMPRESS error: ${e.message} (${Date.now() - t0}ms)`)
        cleanupTemp(ownedCtmp); ownedCtmp = null
        throw e
      }
    }
  } else {
    contentLen    = BigInt(statSync(sourcePath).size)
    contentSource = sourcePath
    logger.info(`[writeVorn] NO_COMPRESS contentLen=${contentLen} (${Date.now() - t0}ms)`)
  }

  const header = Buffer.alloc(HEADER_SIZE)
  MAGIC.copy(header)
  header.writeBigUInt64BE(contentLen, 4)

  const metaBuf = Buffer.from(JSON.stringify(meta), 'utf8')

  try {
    logger.info(`[writeVorn] PIPELINE start tmpPath="${tmpPath}" (${Date.now() - t0}ms)`)
    await pipeline(
      safeCreateReadStream(contentSource),
      async function* (source) {
        yield header
        for await (const chunk of source) yield chunk
        yield SEPARATOR
        yield metaBuf
      },
      createWriteStream(tmpPath)
    )
    logger.info(`[writeVorn] PIPELINE done, renaming (${Date.now() - t0}ms)`)
    renameSync(tmpPath, destPath)
    logger.info(`[writeVorn] RENAME done (${Date.now() - t0}ms)`)
  } catch (e) {
    logger.error(`[writeVorn] PIPELINE/RENAME error: ${e.message} (${Date.now() - t0}ms)`)
    if (existsSync(tmpPath)) unlinkSync(tmpPath)
    throw e
  } finally {
    if (ownedCtmp) cleanupTemp(ownedCtmp)
  }
}

// ── Stream del contenuto (usato dal restore) ──────────────────────────────────

export function contentStream(filePath) {
  const { meta, contentLen } = readVornMeta(filePath)
  if (contentLen === 0n) return Readable.from([])
  const raw = createReadStream(filePath, {
    start: HEADER_SIZE,
    end: HEADER_SIZE + Number(contentLen) - 1
  })
  const type = meta?.compressedType ?? null
  return type ? decompressStream(raw, type) : raw
}
