import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { hostname } from 'os'

export function lockPath(storeDir)  { return join(storeDir, 'vorn', 'lock') }

export function checkLock(storeDir) {
  const lp = lockPath(storeDir)
  if (!existsSync(lp)) return null
  try {
    const lock = JSON.parse(readFileSync(lp, 'utf8'))
    try   { process.kill(lock.pid, 0); return `Store in uso (PID ${lock.pid}) su ${lock.machine}` }
    catch { return null }
  } catch { return null }
}

export function acquireLock(storeDir) {
  mkdirSync(join(storeDir, 'vorn'), { recursive: true })
  writeFileSync(lockPath(storeDir), JSON.stringify({
    pid: process.pid, machine: hostname(), openedAt: new Date().toISOString(),
  }), 'utf8')
}

export function releaseLock(storeDir) {
  try { unlinkSync(lockPath(storeDir)) } catch { /* ignore */ }
}
