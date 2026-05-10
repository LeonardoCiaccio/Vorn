import { createRequire } from 'module'
import { createReadStream, createWriteStream, openSync, readSync, closeSync, statSync } from 'fs'

// Electron patches the `fs` module to intercept .asar file access, treating
// archives as virtual directories. This breaks raw reads AND writes on .asar paths.
// `original-fs` is Electron's unpatched fs — use it when available.
let _fs = { createReadStream, createWriteStream, openSync, readSync, closeSync, statSync }
try {
  const origFs = createRequire(import.meta.url)('original-fs')
  _fs = origFs
} catch { /* not in Electron — regular fs is fine */ }

export const safeCreateReadStream  = (path, opts) => _fs.createReadStream(path, opts)
export const safeCreateWriteStream = (path, opts) => _fs.createWriteStream(path, opts)
export const safeOpenSync          = (...a) => _fs.openSync(...a)
export const safeReadSync          = (...a) => _fs.readSync(...a)
export const safeCloseSync         = (...a) => _fs.closeSync(...a)
export const safeStatSync          = (...a) => _fs.statSync(...a)
