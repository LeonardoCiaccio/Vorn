import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const _path = join(homedir(), '.vorn', 'settings.json')

const DEFAULT_EXCLUDE_PATTERNS = [
  '*.log', '*.tmp', '*.temp',
  'node_modules', '.git', '__pycache__',
  'Thumbs.db', '.DS_Store',
  'dist', 'out', 'output', 'build', 'target',
  '.cache', 'coverage',
]

const _defaults = {
  recentStores:           [],
  theme:                  'dark',
  notifications:          false,
  defaultExcludePatterns: DEFAULT_EXCLUDE_PATTERNS,
}

const ALLOWED_KEYS = new Set(['theme', 'notifications', 'language', 'recentStores', 'defaultExcludePatterns'])

const _validators = {
  theme:                  v => v === 'dark' || v === 'light',
  notifications:          v => typeof v === 'boolean',
  language:               v => ['it', 'en', 'fr', 'de', 'es', 'pt'].includes(v),
  recentStores:           v => Array.isArray(v),
  defaultExcludePatterns: v => Array.isArray(v) && v.length <= 100 && v.every(p => typeof p === 'string' && p.length <= 200),
}

let _cache = null

export function loadSettings() {
  if (_cache) return { ..._cache }
  try {
    _cache = { ..._defaults, ...JSON.parse(readFileSync(_path, 'utf8')) }
  } catch {
    _cache = { ..._defaults }
  }
  return { ..._cache }
}

export function saveSettings(patch) {
  const filtered = Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => ALLOWED_KEYS.has(k) && (_validators[k]?.(v) ?? true))
  )
  const updated = { ...loadSettings(), ...filtered }
  _cache = updated
  const dir = join(homedir(), '.vorn')
  mkdirSync(dir, { recursive: true })
  const tmp = _path + '.tmp'
  writeFileSync(tmp, JSON.stringify(updated, null, 2), 'utf8')
  renameSync(tmp, _path)
  return { ..._cache }
}

export function removeRecentStore(storeDir) {
  const s = loadSettings()
  s.recentStores = s.recentStores.filter(r => r.path !== storeDir)
  saveSettings(s)
}

export function addRecentStore(storeDir) {
  const s = loadSettings()
  s.recentStores = [
    { path: storeDir, lastUsed: new Date().toISOString() },
    ...s.recentStores.filter(r => r.path !== storeDir),
  ].slice(0, 5)
  saveSettings(s)
}
