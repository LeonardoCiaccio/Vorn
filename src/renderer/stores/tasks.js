import { computed, toRaw } from 'vue'
import { state } from './vorn.js'
import { refreshSession } from './sessions.js'

// ── Computed derivati dai task ─────────────────────────────────────────────────

function _taskState(type, resultKey) {
  const tasks = Object.values(state.tasks)
  const running = tasks.find(t => t.type === type && t.status === 'running')
  const last    = tasks.filter(t => t.type === type && t.status !== 'running')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return {
    running:    !!running,
    progress:   running?.progress ?? null,
    [resultKey]: last ? (last.error ? { fatalError: last.error } : last.result) : null,
  }
}

export const integrityState = computed(() => _taskState('integrity',     'report'))
export const clearState     = computed(() => _taskState('clear',         'report'))
export const extractState   = computed(() => _taskState('extract-store', 'result'))

export const pruneState = computed(() => {
  const all     = Object.values(state.tasks).filter(t => t.type === 'prune')
  const running = all.find(t => t.status === 'running')
  const paused  = all.filter(t => t.status === 'paused')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const last    = all.filter(t => t.status === 'done' || t.status === 'error')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return {
    running:      !!running,
    paused:       !!paused,
    activeTaskId: running?.id ?? null,
    progress:     running?.progress ?? null,
    pausedData:   paused?.result   ?? null,
    report:       last ? (last.error ? { fatalError: last.error } : last.result) : null,
  }
})

// ── Query task ────────────────────────────────────────────────────────────────

export function getActiveTask(sessionName) {
  return Object.values(state.tasks).find(t => t.sessionName === sessionName && t.status === 'running') ?? null
}

export function getLastTask(sessionName, type) {
  return Object.values(state.tasks)
    .filter(t => t.sessionName === sessionName && t.type === type && t.status !== 'running')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

export function cancelTask(taskId) { window.vorn.cancelTask(taskId) }

// ── Avvio task ────────────────────────────────────────────────────────────────

function _registerTask(taskId, type, sessionName) {
  state.tasks[taskId] = {
    id: taskId, type, sessionName,
    status: 'running', progress: null, result: null, error: null,
    createdAt: new Date().toISOString(),
  }
}

export async function startBackup(sessionName, resumeTs = null) {
  const { taskId } = await window.vorn.startBackup(sessionName, resumeTs)
  _registerTask(taskId, 'backup', sessionName)
  await refreshSession(sessionName)
  return taskId
}

export async function startRestore(sessionName, runTs, destDir, selectedFiles = null) {
  const { taskId } = await window.vorn.startRestore(sessionName, runTs, destDir, selectedFiles)
  _registerTask(taskId, 'restore', sessionName)
  return taskId
}

export async function startIntegrity() {
  const { taskId } = await window.vorn.startIntegrity()
  _registerTask(taskId, 'integrity', null)
  return taskId
}

export async function startClearStore() {
  const { taskId } = await window.vorn.startClearStore()
  _registerTask(taskId, 'clear', null)
  return taskId
}

export async function startExtractStore(destDir, sessionFilter = null) {
  const { taskId } = await window.vorn.startExtractStore(destDir, sessionFilter)
  _registerTask(taskId, 'extract-store', null)
  return taskId
}

export async function startPrune() {
  for (const [id, t] of Object.entries(state.tasks)) {
    if (t.type === 'prune' && (t.status === 'done' || t.status === 'error')) delete state.tasks[id]
  }
  const { taskId } = await window.vorn.startPrune()
  _registerTask(taskId, 'prune', null)
  return taskId
}

export async function resumePrune(orphanList, nextIndex) {
  for (const [id, t] of Object.entries(state.tasks)) {
    if (t.type === 'prune' && t.status === 'paused') delete state.tasks[id]
  }
  const { taskId } = await window.vorn.resumePrune({ orphanList: toRaw(orphanList), nextIndex })
  _registerTask(taskId, 'prune', null)
  return taskId
}

export function pausePrune(taskId) { window.vorn.pausePrune(taskId) }
