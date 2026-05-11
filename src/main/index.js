import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc.js'
import { logger, initLogger } from './vorn/logger.js'
import { getAppIcon, applyWindowIcon } from './vorn/icon.js'

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
    icon: getAppIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
    }
  })

  applyWindowIcon(win)

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
  initLogger()
  logger.info(`Application started — version ${app.getVersion()} platform=${process.platform}`)
  // Su Windows l'AUMID deve corrispondere all'execPath per i portable (nessun
  // installer/shortcut registrato). Un ID personalizzato ('com.vorn.app') causa
  // icona bianca nel taskbar perché Windows non trova l'icona per quell'ID.
  if (process.platform === 'win32' && app.isPackaged) app.setAppUserModelId(process.execPath)

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
