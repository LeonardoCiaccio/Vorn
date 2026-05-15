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
export async function compressToTemp(sourcePath, tmpPath, type, onProgress = null, isCancelled = null) {
  const total = statSync(sourcePath).size
  let bytesIn = 0
  const ac = new AbortController()
  const cancelPoll = setInterval(() => { if (isCancelled?.()) ac.abort() }, 100)
  try {
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
      createWriteStream(tmpPath),
      { signal: ac.signal }
    )
    return statSync(tmpPath).size
  } catch (e) {
    if (e.name === 'AbortError' || isCancelled?.()) return null
    throw e
  } finally {
    clearInterval(cancelPoll)
  }
}

export function cleanupTemp(tmpPath) {
  if (!tmpPath) return
  try { if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch { /* non-critico */ }
}
