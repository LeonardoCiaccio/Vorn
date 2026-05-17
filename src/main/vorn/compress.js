import { createGzip, createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { safeCreateReadStream, safeCreateWriteStream, safeStatSync, safeExistsSync, safeUnlinkSync } from './safeFs.js'

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
  const total = safeStatSync(sourcePath).size
  let bytesIn = 0
  const ac = new AbortController()
  try {
    await pipeline(
      safeCreateReadStream(sourcePath),
      async function* (source) {
        for await (const chunk of source) {
          // Check di cancel inline su ogni chunk: granularità tipica = qualche ms
          // su file grandi, ben sotto il vecchio poll a 100ms e senza setInterval
          // (su decine di migliaia di file piccoli era overhead non trascurabile).
          if (isCancelled?.()) { ac.abort(); return }
          bytesIn += chunk.length
          onProgress?.(bytesIn, total)
          yield chunk
        }
      },
      _compressor(type),
      safeCreateWriteStream(tmpPath),
      { signal: ac.signal }
    )
    return safeStatSync(tmpPath).size
  } catch (e) {
    if (e.name === 'AbortError' || isCancelled?.()) return null
    throw e
  }
}

export function cleanupTemp(tmpPath) {
  if (!tmpPath) return
  try { if (safeExistsSync(tmpPath)) safeUnlinkSync(tmpPath) } catch { /* non-critico */ }
}
