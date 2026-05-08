const EXECUTABLE_EXTS = new Set([
  // Windows
  '.exe', '.msi', '.bat', '.cmd', '.ps1', '.com', '.scr', '.pif',
  // Script
  '.py', '.rb', '.pl', '.lua',
  // Linux
  '.sh', '.bin', '.appimage', '.deb', '.rpm', '.run',
  // macOS
  '.app', '.dmg', '.pkg', '.command',
])

export function isExecutable(filePath) {
  if (!filePath) return false
  const name = filePath.replace(/\\/g, '/').split('/').at(-1) ?? ''
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  return EXECUTABLE_EXTS.has(name.slice(dot).toLowerCase())
}
