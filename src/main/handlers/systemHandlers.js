import { ipcMain, app, dialog, shell, BrowserWindow } from 'electron'
import { join, normalize, resolve } from 'path'
import { readdirSync }              from 'fs'
import { homedir }                  from 'os'
import { getEntry, listStoreFiles, countStoreFiles, deleteStoreEntry, getCachedFileList } from '../vorn/store.js'
import { listTasks }                from '../vorn/taskManager.js'
import { ctx }                      from '../workerManager.js'
import { logger }                   from '../vorn/logger.js'

const HASH_RE = /^[0-9a-f]{64}$/

let _logWin = null

function _assertHash(hashVorn) {
  if (!hashVorn || !HASH_RE.test(hashVorn)) throw new Error('Hash non valido')
}

function _hashSetForQuery(storeDir, query) {
  const q = query.toLowerCase()
  const source = getCachedFileList(storeDir) ?? readdirSync(storeDir).filter(f => f.endsWith('.vorn'))
  return new Set(
    source
      .filter(f => f.toLowerCase().includes(q))
      .map(f => f.slice(0, -5))
  )
}

export function registerSystemHandlers(mainWindow) {
  mainWindow.on('closed', () => {
    if (_logWin && !_logWin.isDestroyed()) _logWin.close()
  })

  ipcMain.handle('vorn:open-log', () => {
    if (_logWin && !_logWin.isDestroyed()) { _logWin.focus(); return }

    const content = logger.read() || '(log file is empty)'
    const logPath = logger.path()

    _logWin = new BrowserWindow({
      width: 860,
      height: 640,
      title: 'Vorn — Log',
      autoHideMenuBar: true,
      backgroundColor: '#111827',
      icon: join(__dirname, '../../build/icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    _logWin.on('closed', () => { _logWin = null })

    _logWin.loadURL('about:blank')
    _logWin.webContents.once('did-finish-load', () => {
      _logWin.webContents.executeJavaScript(`
        (function () {
          const content = ${JSON.stringify(content)};
          const logPath = ${JSON.stringify(logPath)};

          Object.assign(document.documentElement.style, { height: '100%' });
          Object.assign(document.body.style, {
            margin: '0', height: '100%', display: 'flex', flexDirection: 'column',
            background: '#111827', color: '#d1d5db',
            fontFamily: "Consolas, 'Courier New', monospace", fontSize: '12px',
          });

          const header = document.createElement('div');
          Object.assign(header.style, {
            background: '#1f2937', borderBottom: '1px solid #374151',
            padding: '10px 16px', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', flexShrink: '0',
          });
          const h1 = document.createElement('span');
          Object.assign(h1.style, { fontSize: '13px', fontWeight: '600', color: '#f9fafb' });
          h1.textContent = 'Vorn — Application Log';
          const pathEl = document.createElement('span');
          Object.assign(pathEl.style, { fontSize: '11px', color: '#6b7280' });
          pathEl.textContent = logPath;
          header.appendChild(h1);
          header.appendChild(pathEl);

          const pre = document.createElement('pre');
          Object.assign(pre.style, {
            padding: '16px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            lineHeight: '1.6', overflowY: 'auto', flex: '1',
          });
          content.split('\\n').forEach(line => {
            const span = document.createElement('span');
            if (line.includes('[ERROR]'))        span.style.color = '#f87171';
            else if (line.includes('[WARN ]'))   span.style.color = '#fbbf24';
            else if (line.startsWith('─') || line.includes(' Session ')) {
              span.style.color = '#4b5563';
              span.style.display = 'block';
              span.style.marginTop = '8px';
            }
            span.textContent = line + '\\n';
            pre.appendChild(span);
          });

          document.body.appendChild(header);
          document.body.appendChild(pre);
          pre.scrollTop = pre.scrollHeight;
          document.title = 'Vorn — Log';
        })();
      `)
    })
  })

  ipcMain.handle('vorn:open-external', (_, { url }) => {
    const allowed = ['https://github.com/LeonardoCiaccio/Vorn']
    if (typeof url !== 'string' || !allowed.some(base => url.startsWith(base))) return
    shell.openExternal(url)
  })

  ipcMain.handle('vorn:get-app-info', () => ({
    version:  app.getVersion(),
    platform: process.platform,
    store:    ctx.activeStore,
    homedir:  homedir(),
  }))

  ipcMain.handle('vorn:pick-folder', async (_, { defaultPath } = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      ...(defaultPath ? { defaultPath } : {}),
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('vorn:list-dir', (_, { dirPath }) => {
    if (!dirPath || typeof dirPath !== 'string') return []
    const safePath = normalize(resolve(dirPath))
    try {
      return readdirSync(safePath, { withFileTypes: true })
        .filter(e => { try { return e.isDirectory() || e.isFile() } catch { return false } })
        .map(e => ({ name: e.name, path: join(safePath, e.name), type: e.isDirectory() ? 'dir' : 'file' }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        })
    } catch { return [] }
  })

  ipcMain.handle('vorn:inspect-hash',       (_, { hashVorn })           => { _assertHash(hashVorn); return getEntry(ctx.activeStore, hashVorn) })
  ipcMain.handle('vorn:count-store-files',  ()                          => countStoreFiles(ctx.activeStore))
  ipcMain.handle('vorn:list-store-files',   (_, { offset, limit, query }) =>
    listStoreFiles(ctx.activeStore, offset, limit, query?.trim() ? _hashSetForQuery(ctx.activeStore, query.trim()) : null)
  )
  ipcMain.handle('vorn:delete-store-entry', (_, { hashVorn }) => {
    _assertHash(hashVorn)
    if (listTasks().some(t => t.status === 'running'))
      throw new Error('Impossibile eliminare: operazioni in corso')
    deleteStoreEntry(ctx.activeStore, hashVorn)
  })
}
