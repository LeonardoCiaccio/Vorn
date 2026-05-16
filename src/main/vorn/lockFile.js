import { join } from 'path'
import { existsSync, mkdirSync, openSync, writeSync, fsyncSync, closeSync, readFileSync, unlinkSync } from 'fs'
import { hostname } from 'os'

export function lockPath(storeDir)  { return join(storeDir, 'vorn', 'lock') }

export function checkLock(storeDir) {
  const lp = lockPath(storeDir)
  if (!existsSync(lp)) return null
  try {
    const lock = JSON.parse(readFileSync(lp, 'utf8'))
    // Su NAS/SMB lo store può essere bloccato da un'ALTRA macchina. process.kill
    // verifica solo processi locali: senza il check di hostname, un Vorn locale
    // ruberebbe il lock perché `process.kill(pidRemoto, 0)` falla con ESRCH.
    // Esito: due writer concorrenti su file diverse → store corrotto.
    if (lock.machine && lock.machine !== hostname()) return 'ERR_STORE_IN_USE'
    try   { process.kill(lock.pid, 0); return 'ERR_STORE_IN_USE' }
    catch (e) {
      if (e.code !== 'ESRCH') return 'ERR_STORE_IN_USE'
      try { unlinkSync(lp) } catch { /* già rimosso */ }
      return null
    }
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
    if (e.code === 'EEXIST') throw new Error('ERR_STORE_LOCKED')
    throw e
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

export function releaseLock(storeDir) {
  try { unlinkSync(lockPath(storeDir)) } catch { /* ignore */ }
}
