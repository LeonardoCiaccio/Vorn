import { readdirSync } from 'fs'
import { join } from 'path'

export function walk(dir, excludePaths = [], excludePatterns = [], _results = []) {
  const queue = [dir]
  while (queue.length) {
    const current = queue.pop()
    try {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = join(current, entry.name)
        if (excludePaths.some(p => full === p || full.startsWith(p + '\\') || full.startsWith(p + '/'))) continue
        const relFromRoot = full.slice(dir.length + 1).replace(/\\/g, '/')
        if (excludePatterns.some(pat => matchPattern(relFromRoot, pat) || matchPattern(entry.name, pat))) continue
        
        if (entry.isDirectory()) {
          queue.push(full)
        } else if (entry.isFile()) {
          _results.push(full)
        } else if (entry.isSymbolicLink()) {
          // I link simbolici vengono ignorati per ora per evitare loop o backup inconsistenti.
          // In futuro si potrebbe implementare il salvataggio del target del link.
          continue
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
