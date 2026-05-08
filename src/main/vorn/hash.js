import { openSync, readSync, closeSync, statSync } from 'fs'
import { blake3 } from '@noble/hashes/blake3.js'
import { HASH_CHUNK_BYTES } from './constants.js'

const CHUNK = HASH_CHUNK_BYTES

export function vornHash(filePath) {
  const size  = statSync(filePath).size
  const fd    = openSync(filePath, 'r')
  const h     = blake3.create()
  const buf   = Buffer.alloc(CHUNK)
  let offset  = 0
  try {
    while (offset < size) {
      const n = readSync(fd, buf, 0, Math.min(CHUNK, size - offset), offset)
      h.update(buf.subarray(0, n))
      offset += n
    }
  } finally {
    closeSync(fd)
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
