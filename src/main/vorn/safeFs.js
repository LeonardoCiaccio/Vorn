import { createRequire } from 'module'
import {
  createReadStream, createWriteStream,
  openSync, readSync, writeSync, fsyncSync, closeSync,
  statSync, readdirSync, existsSync,
  unlinkSync, renameSync, readFileSync, mkdirSync, truncateSync,
} from 'fs'

// Electron patches the `fs` module to intercept .asar file access, treating
// archives as virtual directories. This breaks raw reads AND writes on .asar paths.
// `original-fs` is Electron's unpatched fs — use it when available.
let _fs = {
  createReadStream, createWriteStream,
  openSync, readSync, writeSync, fsyncSync, closeSync,
  statSync, readdirSync, existsSync,
  unlinkSync, renameSync, readFileSync, mkdirSync, truncateSync,
}
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
export const safeWriteSync         = (...a) => _fs.writeSync(...a)
export const safeFsyncSync         = (...a) => _fs.fsyncSync(...a)
export const safeCloseSync         = (...a) => _fs.closeSync(...a)
export const safeStatSync          = (path, ...a) => _fs.statSync(toLongPath(path), ...a)
export const safeReaddirSync       = (path, opts) => _fs.readdirSync(toLongPath(path), opts)
export const safeExistsSync        = (path)       => _fs.existsSync(toLongPath(path))
export const safeUnlinkSync        = (path)       => _fs.unlinkSync(toLongPath(path))
export const safeRenameSync        = (a, b)       => _fs.renameSync(toLongPath(a), toLongPath(b))
export const safeReadFileSync      = (path, opts) => _fs.readFileSync(toLongPath(path), opts)
export const safeMkdirSync         = (path, opts) => _fs.mkdirSync(toLongPath(path), opts)
export const safeTruncateSync      = (path, len)  => _fs.truncateSync(toLongPath(path), len)

// ── Promise API (fs/promises) ───────────────────────────────────────────────
// `original-fs` di Electron NON espone le promise API, quindi usiamo le
// promise di `fs` standard e applichiamo solo `toLongPath` per il fix Win32.
// Per i path dello store (esterni a .asar) il prefix `\\?\` basta.
import {
  access as _accessP, writeFile as _writeFileP, truncate as _truncateP,
  open as _openP, unlink as _unlinkP,
} from 'fs/promises'

export const safeAccess     = (path, mode)  => _accessP(toLongPath(path), mode)
export const safeWriteFile  = (path, data, opts) => _writeFileP(toLongPath(path), data, opts)
export const safeTruncate   = (path, len)   => _truncateP(toLongPath(path), len)
export const safeOpen       = (path, flag)  => _openP(toLongPath(path), flag)
export const safeUnlink     = (path)        => _unlinkP(toLongPath(path))
