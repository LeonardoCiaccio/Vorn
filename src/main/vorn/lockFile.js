import { join } from 'path'
import { existsSync, mkdirSync, openSync, writeSync, fsyncSync, closeSync, readFileSync, unlinkSync } from 'fs'
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
  const lp   = lockPath(storeDir)
  const data = Buffer.from(JSON.stringify({ pid: process.pid, machine: hostname(), openedAt: new Date().toISOString() }))
  let fd
  try {
    fd = openSync(lp, 'wx') // atomico a livello OS: lancia EEXIST se il file esiste già
    writeSync(fd, data)
    fsyncSync(fd)
  } catch (e) {
    if (e.code === 'EEXIST') throw new Error('Store già bloccato da un altro processo')
    throw e
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

export function releaseLock(storeDir) {
  try { unlinkSync(lockPath(storeDir)) } catch { /* ignore */ }
}
