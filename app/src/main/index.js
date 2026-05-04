import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc.js'

// Registra l'AUMID solo nel build packaged — in dev lascerebbe electron.exe
// registrato nel registry di Windows, causando click sulle notifiche che
// lanciano il dev electron invece dell'app produzione.
if (process.platform === 'win32' && app.isPackaged) app.setAppUserModelId('com.vorn.app')

// Singola istanza: se una seconda viene lanciata (es. click su toast Windows)
// focalizza quella già aperta e termina la nuova
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools() // APRI DEBUG AUTOMATICAMENTE
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  const win = createWindow()
  registerIpcHandlers(win)

  // Seconda istanza (click su toast Windows): riporta la finestra in primo piano
  app.on('second-instance', () => {
    if (win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
