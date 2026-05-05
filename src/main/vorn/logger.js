import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const _dir       = join(homedir(), '.vorn')
const _path      = join(_dir, 'vorn.log')
const MAX_LINES  = 5000
const KEEP_LINES = 2500
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

let _lineCount = 0

function _parseLineDate(line) {
  const m = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/)
  return m ? new Date(m[1].replace(' ', 'T')) : null
}

function _trim() {
  try {
    const lines = readFileSync(_path, 'utf8').split('\n').filter(l => l.length > 0)
    const kept  = lines.slice(-KEEP_LINES)
    writeFileSync(_path, kept.join('\n') + '\n', 'utf8')
    _lineCount  = kept.length
  } catch { /* silent */ }
}

function _write(level, message) {
  const ts   = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const line = `[${ts}] [${level.padEnd(5)}] ${message}\n`
  try {
    mkdirSync(_dir, { recursive: true })
    appendFileSync(_path, line, 'utf8')
    if (++_lineCount > MAX_LINES) _trim()
  } catch { /* logging must never crash the app */ }
}

export function initLogger() {
  try {
    mkdirSync(_dir, { recursive: true })
    const cutoff = Date.now() - MAX_AGE_MS
    let lines = []
    try { lines = readFileSync(_path, 'utf8').split('\n').filter(l => l.length > 0) } catch { /* file not yet created */ }

    lines = lines.filter(line => {
      const d = _parseLineDate(line)
      return d ? d.getTime() >= cutoff : true
    })

    if (lines.length > MAX_LINES) lines = lines.slice(-KEEP_LINES)

    const ts        = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const separator = `${'─'.repeat(20)} Session ${ts} ${'─'.repeat(20)}`
    lines.push(separator)

    writeFileSync(_path, lines.join('\n') + '\n', 'utf8')
    _lineCount = lines.length
  } catch { /* silent */ }
}

export const logger = {
  info:  (msg) => _write('INFO',  msg),
  warn:  (msg) => _write('WARN',  msg),
  error: (msg) => _write('ERROR', msg),
  path:  ()    => _path,
  read:  ()    => { try { return readFileSync(_path, 'utf8') } catch { return '' } },
}
