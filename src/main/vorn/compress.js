import { createGzip, createGunzip } from 'zlib'
import { createReadStream, createWriteStream, existsSync, statSync, unlinkSync } from 'fs'
import { pipeline } from 'stream/promises'

function _compressor(type) {
  if (type === 'gzip') return createGzip()
  throw new Error(`Tipo di compressione non supportato: ${type}`)
}

function _decompressor(type) {
  if (type === 'gzip') return createGunzip()
  throw new Error(`Tipo di compressione non supportato: ${type}`)
}

export function decompressStream(inputStream, type) {
  return inputStream.pipe(_decompressor(type))
}

// Comprime sourcePath in tmpPath, ritorna la size compressa.
// Il chiamante è responsabile di eliminare tmpPath se non serve più.
export async function compressToTemp(sourcePath, tmpPath, type) {
  await pipeline(
    createReadStream(sourcePath),
    _compressor(type),
    createWriteStream(tmpPath)
  )
  return statSync(tmpPath).size
}

export function cleanupTemp(tmpPath) {
  try { if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch { /* non-critico */ }
}
