import { openSync, readSync, writeSync, fsyncSync, closeSync, truncateSync, createReadStream, createWriteStream, statSync, existsSync, readFileSync, unlinkSync, renameSync } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { compressToTemp, decompressStream, cleanupTemp } from './compress.js'
import { vornHash } from './hash.js'
import { safeCreateReadStream } from './safeFs.js'

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
    const sepN   = readSync(fd, sepBuf, 0, SEPARATOR.length, metaOffset)
    // Distinguere "file troncato prima dei 4 byte del separatore" da "i 4 byte
    // ci sono ma sono diversi": entrambi indicano corruzione ma con cause diverse,
    // e l'errore generico ERR_SEPARATOR_NOT_FOUND maschera l'EOF prematuro.
    if (sepN < SEPARATOR.length) throw new Error('ERR_FILE_TRUNCATED')
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
          // Fingerprint: il WAL può essere recovery valido solo se è stato scritto
          // per QUESTO .vorn nello stato in cui si trova ora. Senza fingerprint,
          // un WAL orfano (lasciato da un crash precedente, vedi cleanup sotto)
          // potrebbe "resuscitare" records mai committati se in futuro la meta
          // tail viene corrotta da un crash diverso. Con il contentLen verifichiamo
          // che il WAL appartenga a un file con la stessa quantità di contenuto.
          if (walData.contentLen !== undefined && walData.contentLen !== Number(contentLen)) {
            throw new Error('ERR_WAL_FINGERPRINT_MISMATCH')
          }
          recovered = walData.meta
        } else {
          // ⚠️ DEPRECATED: WAL legacy senza checksum né fingerprint, accettato per
          // retrocompatibilità con .vorn scritti da versioni precedenti. Pianificare
          // la rimozione dopo un ciclo di release in cui tutti gli store sono stati
          // riaperti almeno una volta (il cleanup orfani sotto svuota i WAL legacy).
          recovered = walData
        }
      } catch (e) {
        throw new Error('ERR_WAL_INVALID', { cause: e })
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

    // Cleanup .mtmp orfano: la meta è leggibile, quindi il WAL è residuo di un
    // _updateMeta interrotto PRIMA del truncate. Quel WAL non è mai stato applicato:
    // lasciarlo significa che una corruzione futura della meta tail (USB scollegato
    // al momento sbagliato) potrebbe "resuscitare" records mai committati.
    // L'eliminazione è sicura: il dato originale (`meta`) è intatto.
    const orphanWal = filePath + '.mtmp'
    if (existsSync(orphanWal)) {
      try { unlinkSync(orphanWal) } catch { /* non-critico */ }
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

export async function writeVornFromSource(destPath, meta, sourcePath, compressionType = null, precompressedPath = null, precompressedHash = null, signal = null) {
  const tmpPath = destPath + '.tmp'

  let contentLen
  let contentSource
  let ownedCtmp = null

  if (compressionType) {
    if (precompressedPath) {
      contentLen            = BigInt(statSync(precompressedPath).size)
      contentSource         = precompressedPath
      meta.compressed_hash  = precompressedHash
      meta.bytes_compressed = Number(contentLen)
    } else {
      ownedCtmp = join(tmpdir(), 'vorn_' + basename(destPath) + '.ctmp')
      try {
        const compressedSize  = await compressToTemp(sourcePath, ownedCtmp, compressionType)
        contentLen            = BigInt(compressedSize)
        contentSource         = ownedCtmp
        meta.compressed_hash  = vornHash(ownedCtmp)
        meta.bytes_compressed = compressedSize
      } catch (e) {
        cleanupTemp(ownedCtmp); ownedCtmp = null
        throw e
      }
    }
  } else {
    contentLen    = BigInt(statSync(sourcePath).size)
    contentSource = sourcePath
  }

  const header = Buffer.alloc(HEADER_SIZE)
  MAGIC.copy(header)
  header.writeBigUInt64BE(contentLen, 4)

  const metaBuf = Buffer.from(JSON.stringify(meta), 'utf8')

  // TOCTOU mitigation per il ramo blob plain non-compresso: leggere ESATTAMENTE
  // i `contentLen` bytes promessi dall'header. Senza il limite `end`, un file
  // "vivo" (log, DB, mailbox) può crescere durante la pipeline e nel .vorn
  // finirebbero più bytes di quelli dichiarati → readVornMeta non troverebbe
  // più il SEPARATOR all'offset corretto e il file diventerebbe irrecuperabile.
  // Per il ramo compresso, contentSource è un .ctmp stabile (no TOCTOU).
  const readOpts = (!compressionType && contentLen > 0n)
    ? { end: Number(contentLen) - 1 }
    : undefined

  let bytesRead = 0n
  try {
    await pipeline(
      safeCreateReadStream(contentSource, readOpts),
      async function* (source) {
        yield header
        for await (const chunk of source) {
          bytesRead += BigInt(chunk.length)
          yield chunk
        }
        yield SEPARATOR
        yield metaBuf
      },
      createWriteStream(tmpPath),
      ...(signal ? [{ signal }] : [])
    )
    // Verifica complementare: se il file è stato TRONCATO durante la lettura
    // (caso opposto rispetto a sopra), `bytesRead` è < `contentLen` e l'header
    // mentirebbe nell'altra direzione. Abortire pulisce lo stato.
    if (bytesRead !== contentLen) {
      throw new Error('ERR_SOURCE_SIZE_MISMATCH')
    }
    renameSync(tmpPath, destPath)
  } catch (e) {
    if (existsSync(tmpPath)) unlinkSync(tmpPath)
    throw e
  } finally {
    if (ownedCtmp) cleanupTemp(ownedCtmp)
  }
}

// ── Scrittura manifest .vorn (strategy: 'chunks') ────────────────────────────
// Il manifest non ha contenuto: contentLen=0, i chunk sono nel metadata JSON.

export function writeVornManifest(destPath, meta) {
  const tmpPath = destPath + '.tmp'
  const header  = Buffer.alloc(HEADER_SIZE)
  MAGIC.copy(header)
  header.writeBigUInt64BE(0n, 4)
  const metaBuf = Buffer.from(JSON.stringify(meta), 'utf8')
  try {
    const fd = openSync(tmpPath, 'w')
    try {
      writeSync(fd, header)
      writeSync(fd, SEPARATOR)
      writeSync(fd, metaBuf)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmpPath, destPath)
  } catch (e) {
    try { unlinkSync(tmpPath) } catch { /* non-critico */ }
    throw e
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
