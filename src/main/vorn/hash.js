import { blake3 } from '@noble/hashes/blake3.js'
import { HASH_CHUNK_BYTES } from './constants.js'
import { safeOpenSync, safeReadSync, safeCloseSync, safeStatSync } from './safeFs.js'

const CHUNK = HASH_CHUNK_BYTES

export function vornHash(filePath, isCancelled, onChunk = null) {
  const size  = safeStatSync(filePath).size
  const fd    = safeOpenSync(filePath, 'r')
  const h     = blake3.create()
  const buf   = Buffer.alloc(CHUNK)
  let offset  = 0
  try {
    while (offset < size) {
      if (isCancelled?.()) return null
      const n = safeReadSync(fd, buf, 0, Math.min(CHUNK, size - offset), offset)
      // EOF prematuro: il file è stato TRONCATO sotto di noi durante l'hashing
      // (log rotato, atomic replace, USB cache flush). Senza questo guard,
      // `offset += 0` produrrebbe un loop infinito finché il cancel timer
      // (8s) non force-terminate il worker. Errore tipato → il caller lo
      // tratta come errore per-file e continua col prossimo (≠ null cancel).
      if (n === 0) throw new Error('ERR_SOURCE_TRUNCATED_DURING_HASH')
      h.update(buf.subarray(0, n))
      offset += n
      onChunk?.(offset, size)
    }
  } finally {
    safeCloseSync(fd)
  }
  return Buffer.from(h.digest()).toString('hex')
}

// Hashing da stream leggibile — usato da integrityWorker per file compressi
export function hashFromStream(readable) {
  const h = blake3.create()
  return new Promise((resolve, reject) => {
    readable.on('data', chunk => h.update(chunk))
    readable.on('end', () => resolve(Buffer.from(h.digest()).toString('hex')))
    readable.on('error', reject)
  })
}

// Hashing da file descriptor aperto — usato da integrityWorker.
// `isCancelled` permette al worker di abortire su file molto grandi senza
// passare per il setTimeout di force-terminate. Senza il check `n === 0`
// un .vorn troncato esternamente (USB-unplug, antivirus, altra app) farebbe
// `offset += 0` → loop infinito sincrono → integrity worker hung indefinitamente
// (cancelFlag mai consultato perché il loop non torna al chiamante).
export function hashFromFd(fd, contentOffset, contentLen, isCancelled = null) {
  const size   = Number(contentLen)
  const h      = blake3.create()
  const buf    = Buffer.alloc(CHUNK)
  let offset   = 0
  while (offset < size) {
    if (isCancelled?.()) return null
    const n = safeReadSync(fd, buf, 0, Math.min(CHUNK, size - offset), contentOffset + offset)
    if (n === 0) throw new Error('ERR_SOURCE_TRUNCATED_DURING_HASH')
    h.update(buf.subarray(0, n))
    offset += n
  }
  return Buffer.from(h.digest()).toString('hex')
}
