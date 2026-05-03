import { readdirSync } from 'fs'
import { join } from 'path'

export function walk(dir, excludePaths = [], excludePatterns = [], _results = []) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (excludePaths.some(p => full === p || full.startsWith(p + '\\') || full.startsWith(p + '/'))) continue
      if (excludePatterns.some(pat => matchPattern(entry.name, pat))) continue
      if (entry.isDirectory()) walk(full, excludePaths, excludePatterns, _results)
      else if (entry.isFile()) _results.push(full)
    }
  } catch (_) { /* skip unreadable dirs */ }
  return _results
}

export function matchPattern(name, pattern) {
  const pat = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern
  const re = new RegExp('^' + pat.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i')
  return re.test(name)
}
