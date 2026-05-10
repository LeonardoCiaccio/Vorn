import { readSync } from 'fs'
import { blake3 } from '@noble/hashes/blake3.js'
import { HASH_CHUNK_BYTES } from './constants.js'
import { safeOpenSync, safeReadSync, safeCloseSync, safeStatSync } from './safeFs.js'

const CHUNK = HASH_CHUNK_BYTES

export function vornHash(filePath) {
  const size  = safeStatSync(filePath).size
  const fd    = safeOpenSync(filePath, 'r')
  const h     = blake3.create()
  const buf   = Buffer.alloc(CHUNK)
  let offset  = 0
  try {
    while (offset < size) {
      const n = safeReadSync(fd, buf, 0, Math.min(CHUNK, size - offset), offset)
      h.update(buf.subarray(0, n))
      offset += n
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

// Hashing da file descriptor aperto — usato da integrityWorker
export function hashFromFd(fd, contentOffset, contentLen) {
  const size   = Number(contentLen)
  const h      = blake3.create()
  const buf    = Buffer.alloc(CHUNK)
  let offset   = 0
  while (offset < size) {
    const n = readSync(fd, buf, 0, Math.min(CHUNK, size - offset), contentOffset + offset)
    h.update(buf.subarray(0, n))
    offset += n
  }
  return Buffer.from(h.digest()).toString('hex')
}
