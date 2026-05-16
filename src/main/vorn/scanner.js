import { join } from 'path'
import { safeReaddirSync } from './safeFs.js'

// Normalizza il path per il confronto delle esclusioni: su Win32 NTFS è
// case-insensitive e l'utente può salvare `C:\Data` in settings mentre il
// walker scopre `c:\data`. Senza normalize la `startsWith` fallisce e i file
// "esclusi" vengono backuppati comunque. Anche separator mixed (`/` vs `\`)
// va normalizzato (`safeJoin` produce sempre `\` su Win ma settings legacy
// può contenere `/`).
const _isWin32 = process.platform === 'win32'
function _normForCompare(p) {
  if (typeof p !== 'string') return ''
  const slashed = _isWin32 ? p.replace(/\//g, '\\') : p
  return _isWin32 ? slashed.toLowerCase() : slashed
}

export function walk(dir, excludePaths = [], excludePatterns = [], _results = []) {
  const normExcludes = excludePaths.map(_normForCompare)
  const queue = [dir]
  while (queue.length) {
    const current = queue.pop()
    try {
      for (const entry of safeReaddirSync(current, { withFileTypes: true })) {
        const full     = join(current, entry.name)
        const fullNorm = _normForCompare(full)
        if (normExcludes.some(p => fullNorm === p || fullNorm.startsWith(p + (_isWin32 ? '\\' : '/')))) continue
        const relFromRoot = full.slice(dir.length + 1).replace(/\\/g, '/')
        if (excludePatterns.some(pat => matchPattern(relFromRoot, pat) || matchPattern(entry.name, pat))) continue
        
        // CONTROLLARE PRIMA il symlink: su Windows una junction (NTFS reparse
        // point) viene riportata da Dirent come isDirectory()===true E
        // isSymbolicLink()===true. Se controlliamo isDirectory() per primo
        // ricorriamo dentro `C:\Users\<user>\AppData\Local\Application Data`
        // (junction storica) e si crea un loop di crescita esponenziale.
        if (entry.isSymbolicLink()) {
          continue
        } else if (entry.isDirectory()) {
          queue.push(full)
        } else if (entry.isFile()) {
          _results.push(full)
        }
      }
    } catch (_) { /* skip unreadable dirs */ }
  }
  return _results
}

const _patternCache = new Map()

export function clearPatternCache() { _patternCache.clear() }

export function matchPattern(name, pattern) {
  if (!pattern || pattern.length > 200) return false
  let re = _patternCache.get(pattern)
  if (!re) {
    if (_patternCache.size > 200) _patternCache.clear()
    const pat = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern
    const escaped = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Collassa wildcards consecutive prima della conversione per prevenire ReDoS (*** → .*)
    const reStr = escaped
      .replace(/\*/g, '\x00')
      .replace(/\x00+/g, '.*')
      .replace(/\?/g, '.')
    re = new RegExp('^' + reStr + '$', 'i')
    _patternCache.set(pattern, re)
  }
  return re.test(name)
}
