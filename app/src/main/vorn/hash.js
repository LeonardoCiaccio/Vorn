import { createHash } from 'crypto'
import { openSync, readSync, closeSync, statSync, readFileSync } from 'fs'

const SAMPLES     = 13
const SAMPLE_SIZE = 8
const SMALL_FILE  = SAMPLES * SAMPLE_SIZE  // 104 bytes

export function vornFingerprint(filePath) {
  const size = statSync(filePath).size
  const buf  = Buffer.alloc(SAMPLE_SIZE)
  const fd   = openSync(filePath, 'r')
  const step = Math.max(1, Math.floor((size - SAMPLE_SIZE) / (SAMPLES - 1)))
  const chunks = []
  for (let i = 0; i < SAMPLES; i++) {
    const offset = Math.min(i * step, size - SAMPLE_SIZE)
    readSync(fd, buf, 0, SAMPLE_SIZE, offset)
    chunks.push(buf.toString('hex'))
  }
  closeSync(fd)
  return size.toString(16).padStart(16, '0') + ':' + chunks.join(':')
}

export function vornHash(filePath) {
  const size = statSync(filePath).size
  if (size <= SMALL_FILE) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex')
  }
  return createHash('sha256').update(vornFingerprint(filePath)).digest('hex')
}
