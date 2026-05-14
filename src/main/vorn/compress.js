import { createGzip, createGunzip } from 'zlib'
import { createWriteStream, existsSync, statSync, unlinkSync } from 'fs'
import { pipeline } from 'stream/promises'
import { safeCreateReadStream } from './safeFs.js'

function _compressor(type) {
  if (type === 'gzip') return createGzip()
  throw new Error('ERR_COMPRESSION_NOT_SUPPORTED')
}

function _decompressor(type) {
  if (type === 'gzip') return createGunzip()
  throw new Error('ERR_COMPRESSION_NOT_SUPPORTED')
}

export function decompressStream(inputStream, type) {
  return inputStream.pipe(_decompressor(type))
}

// Comprime sourcePath in tmpPath, ritorna la size compressa.
// Il chiamante è responsabile di eliminare tmpPath se non serve più.
export async function compressToTemp(sourcePath, tmpPath, type, onProgress = null) {
  const total = statSync(sourcePath).size
  let bytesIn = 0
  await pipeline(
    safeCreateReadStream(sourcePath),
    async function* (source) {
      for await (const chunk of source) {
        bytesIn += chunk.length
        onProgress?.(bytesIn, total)
        yield chunk
      }
    },
    _compressor(type),
    createWriteStream(tmpPath)
  )
  return statSync(tmpPath).size
}

export function cleanupTemp(tmpPath) {
  try { if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch { /* non-critico */ }
}
