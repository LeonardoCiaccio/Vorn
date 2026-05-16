import { createRequire } from 'module'
import { createReadStream, createWriteStream, openSync, readSync, closeSync, statSync, readdirSync, existsSync } from 'fs'

// Electron patches the `fs` module to intercept .asar file access, treating
// archives as virtual directories. This breaks raw reads AND writes on .asar paths.
// `original-fs` is Electron's unpatched fs — use it when available.
let _fs = { createReadStream, createWriteStream, openSync, readSync, closeSync, statSync, readdirSync, existsSync }
try {
  const origFs = createRequire(import.meta.url)('original-fs')
  _fs = origFs
} catch { /* not in Electron — regular fs is fine */ }

// On Windows, paths longer than 260 chars require the \\?\ extended-length prefix.
// Normalizza forward slash a backslash prima della valutazione; gestisce sia path
// drive-letter (C:\foo) sia UNC (\\server\share\foo → \\?\UNC\server\share\foo).
function toLongPath(p) {
  if (process.platform !== 'win32' || typeof p !== 'string') return p
  if (p.startsWith('\\\\?\\')) return p
  const n = p.replace(/\//g, '\\')
  if (/^\\\\[^\\?][^\\]*\\/.test(n)) return '\\\\?\\UNC\\' + n.slice(2) // UNC: \\server\share\... → \\?\UNC\server\share\...
  if (/^[A-Za-z]:\\/.test(n))         return '\\\\?\\' + n
  return p
}

export const safeCreateReadStream  = (path, opts) => _fs.createReadStream(toLongPath(path), opts)
export const safeCreateWriteStream = (path, opts) => _fs.createWriteStream(toLongPath(path), opts)
export const safeOpenSync          = (path, ...a) => _fs.openSync(toLongPath(path), ...a)
export const safeReadSync          = (...a) => _fs.readSync(...a)
export const safeCloseSync         = (...a) => _fs.closeSync(...a)
export const safeStatSync          = (path, ...a) => _fs.statSync(toLongPath(path), ...a)
export const safeReaddirSync       = (path, opts) => _fs.readdirSync(toLongPath(path), opts)
export const safeExistsSync        = (path) => _fs.existsSync(toLongPath(path))
