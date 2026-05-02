import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const _path = join(homedir(), '.vorn', 'settings.json')

const _defaults = {
  recentStores: [],
  theme:        'dark',
}

export function loadSettings() {
  try {
    return { ..._defaults, ...JSON.parse(readFileSync(_path, 'utf8')) }
  } catch {
    return { ..._defaults }
  }
}

export function saveSettings(patch) {
  const updated = { ...loadSettings(), ...patch }
  mkdirSync(join(homedir(), '.vorn'), { recursive: true })
  writeFileSync(_path, JSON.stringify(updated, null, 2), 'utf8')
  return updated
}

export function addRecentStore(storeDir) {
  const s = loadSettings()
  s.recentStores = [
    { path: storeDir, lastUsed: new Date().toISOString() },
    ...s.recentStores.filter(r => r.path !== storeDir),
  ].slice(0, 5)
  saveSettings(s)
}
