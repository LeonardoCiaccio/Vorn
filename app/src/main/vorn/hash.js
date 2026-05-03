import { openSync, readSync, closeSync, statSync } from 'fs'
import { blake3 } from '@noble/hashes/blake3.js'

const CHUNK = 4 * 1024 * 1024  // 4 MB — mai più di questo in RAM per volta

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
