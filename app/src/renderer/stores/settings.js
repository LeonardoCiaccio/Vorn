import { reactive, watch } from 'vue'

const STORAGE_KEY = 'vorn-settings'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

const saved = load()

export const settings = reactive({
  theme:            saved.theme            ?? 'dark',
  startWithSystem:  saved.startWithSystem  ?? false,
  startMinimized:   saved.startMinimized   ?? false,
  defaultStore:     saved.defaultStore     ?? '',
  excludes:         saved.excludes         ?? ['*.tmp', '*.log', 'node_modules/', '.git/', 'Thumbs.db'],
  compress:         saved.compress         ?? false,
  maxFileMB:        saved.maxFileMB        ?? 0,
  autoBackup:       saved.autoBackup       ?? false,
  autoBackupHours:  saved.autoBackupHours  ?? 6,
  notifyDone:       saved.notifyDone       ?? true,
  notifyErrors:     saved.notifyErrors     ?? true,
  notifySound:      saved.notifySound      ?? false,
  logLevel:         saved.logLevel         ?? 'info',
  devTools:         saved.devTools         ?? false,
})

// Persist every change
watch(settings, (val) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...val }))
}, { deep: true })

export function setTheme(theme) {
  settings.theme = theme
  applyTheme(theme)
}

export function applyTheme(theme) {
  const html = document.documentElement
  html.classList.remove('dark', 'light')
  html.classList.add(theme)
}

// Apply on import
applyTheme(settings.theme)
