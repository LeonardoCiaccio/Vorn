import { app, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

// electron-vite bundla il main in out/main/index.js (CJS), quindi __dirname
// punta a <root>/out/main e ../../build risale a <root>/build.
// In packaged usiamo extraResources copiate in resources/icons/.

let _cached = null

// Windows: serve .ico multi-resolution per il taskbar (un PNG grande viene
// scalato malissimo dal compositor e mostra l'icona bianca di fallback).
// Linux: PNG va bene ma deve essere ≤ 256px, altrimenti molti WM lo ignorano.
// macOS: .icns nativo.
function _iconFile() {
  if (process.platform === 'win32')  return 'icon.ico'
  if (process.platform === 'darwin') return 'icon.icns'
  return 'icon.png'
}

export function getAppIcon() {
  if (_cached) return _cached

  const base = app.isPackaged
    ? join(process.resourcesPath, 'icons')
    : join(__dirname, '../../build')
  const abs = join(base, _iconFile())

  let img = nativeImage.createEmpty()
  const exists = existsSync(abs)
  if (exists) {
    const candidate = nativeImage.createFromPath(abs)
    if (!candidate.isEmpty()) {
      // Su Linux, se il PNG è troppo grande, rescalalo a 256
      if (process.platform === 'linux') {
        const s = candidate.getSize()
        img = s.width > 256 ? candidate.resize({ width: 256, height: 256 }) : candidate
      } else {
        img = candidate
      }
    }
  }

  _cached = img
  return img
}

export function applyWindowIcon(win) {
  const img = getAppIcon()
  if (!img.isEmpty()) win.setIcon(img)
}
