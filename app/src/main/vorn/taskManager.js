const tasks = new Map()
const MAX_COMPLETED = 20

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function createTask(type, sessionName) {
  const task = {
    id:          makeId(),
    type,
    sessionName,
    status:      'running',
    progress:    null,
    result:      null,
    error:       null,
    createdAt:   new Date().toISOString(),
    _cancelFn:   null,
  }
  tasks.set(task.id, task)
  _pruneCompleted()
  return task
}

export function setTaskCancelFn(taskId, fn) {
  const t = tasks.get(taskId)
  if (t) t._cancelFn = fn
}

export function updateTaskProgress(taskId, progress) {
  const t = tasks.get(taskId)
  if (t) t.progress = progress
}

export function finishTask(taskId, result) {
  const t = tasks.get(taskId)
  if (!t) return
  t.status    = result.status === 'paused' ? 'paused' : 'done'
  t.result    = result
  t._cancelFn = null
}

export function failTask(taskId, errorMsg) {
  const t = tasks.get(taskId)
  if (!t) return
  t.status    = 'error'
  t.error     = errorMsg
  t._cancelFn = null
}

export function cancelTask(taskId) {
  const t = tasks.get(taskId)
  if (t?._cancelFn) { t._cancelFn(); return true }
  return false
}

export function hasRunningTask(sessionName) {
  return [...tasks.values()].some(t => t.sessionName === sessionName && t.status === 'running')
}

export function listTasks() {
  return [...tasks.values()].map(_pub)
}

export function getTask(taskId) {
  const t = tasks.get(taskId)
  return t ? _pub(t) : null
}

function _pub({ _cancelFn, ...rest }) { return rest }

function _pruneCompleted() {
  const done = [...tasks.entries()].filter(([, t]) => t.status !== 'running')
  if (done.length > MAX_COMPLETED)
    done.slice(0, done.length - MAX_COMPLETED).forEach(([id]) => tasks.delete(id))
}
