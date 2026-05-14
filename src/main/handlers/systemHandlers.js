import { ipcMain, app, dialog, shell, BrowserWindow, net } from 'electron'
import { normalize, resolve, join } from 'path'
import { readdirSync }              from 'fs'
import { homedir }                  from 'os'
import { getEntry, listStoreFiles, countStoreFiles, deleteStoreEntry, getCachedFileList } from '../vorn/store.js'
import { listTasks }                from '../vorn/taskManager.js'
import { ctx }                      from '../workerManager.js'
import { logger }                   from '../vorn/logger.js'
import { loadSettings }             from '../vorn/settings.js'
import { assertHash }               from './_validation.js'
import { getAppIcon, applyWindowIcon } from '../vorn/icon.js'

function _isNewer(latest, current) {
  const toNums = v => v.replace(/^v/, '').split('.').map(Number)
  const a = toNums(latest)
  const b = toNums(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

let _logWin = null

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
    const isDark  = (loadSettings().theme ?? 'dark') === 'dark'

    const c = isDark ? {
      bg:            '#111827',
      text:          '#d1d5db',
      headerBg:      '#1f2937',
      headerBorder:  '#374151',
      headerTitle:   '#f9fafb',
      headerPath:    '#6b7280',
      error:         '#f87171',
      warn:          '#fbbf24',
      separator:     '#4b5563',
      scrollThumb:   '#374151',
    } : {
      bg:            '#f9fafb',
      text:          '#1f2937',
      headerBg:      '#f3f4f6',
      headerBorder:  '#e5e7eb',
      headerTitle:   '#111827',
      headerPath:    '#6b7280',
      error:         '#dc2626',
      warn:          '#d97706',
      separator:     '#9ca3af',
      scrollThumb:   '#d1d5db',
    }

    _logWin = new BrowserWindow({
      width: 860,
      height: 640,
      title: 'Vorn — Log',
      autoHideMenuBar: true,
      backgroundColor: c.bg,
      icon: getAppIcon(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    applyWindowIcon(_logWin)

    _logWin.on('closed', () => { _logWin = null })

    _logWin.loadURL('about:blank')
    _logWin.webContents.once('did-finish-load', () => {
      _logWin.webContents.executeJavaScript(`
        (function () {
          const content = ${JSON.stringify(content)};
          const logPath = ${JSON.stringify(logPath)};
          const c = ${JSON.stringify(c)};

          Object.assign(document.documentElement.style, { height: '100%' });
          Object.assign(document.body.style, {
            margin: '0', height: '100%', display: 'flex', flexDirection: 'column',
            background: c.bg, color: c.text,
            fontFamily: "Consolas, 'Courier New', monospace", fontSize: '12px',
          });

          const style = document.createElement('style');
          style.textContent = '::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:' + c.scrollThumb + ';border-radius:99px}';
          document.head.appendChild(style);

          const header = document.createElement('div');
          Object.assign(header.style, {
            background: c.headerBg, borderBottom: '1px solid ' + c.headerBorder,
            padding: '10px 16px', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', flexShrink: '0',
          });
          const h1 = document.createElement('span');
          Object.assign(h1.style, { fontSize: '13px', fontWeight: '600', color: c.headerTitle });
          h1.textContent = 'Vorn — Application Log';
          const pathEl = document.createElement('span');
          Object.assign(pathEl.style, { fontSize: '11px', color: c.headerPath });
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
            if (line.includes('[ERROR]'))        span.style.color = c.error;
            else if (line.includes('[WARN ]'))   span.style.color = c.warn;
            else if (line.startsWith('─') || line.includes(' Session ')) {
              span.style.color = c.separator;
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

  ipcMain.handle('vorn:check-update', async () => {
    try {
      const res = await net.fetch(
        'https://api.github.com/repos/LeonardoCiaccio/Vorn/releases/latest',
        { headers: { 'User-Agent': 'Vorn-App' } }
      )
      if (!res.ok) return null
      const data = await res.json()
      const latest  = data.tag_name?.replace(/^v/, '')
      const current = app.getVersion()
      if (!latest) return null
      return { latest, current, hasUpdate: _isNewer(latest, current), url: data.html_url }
    } catch {
      return null
    }
  })

  ipcMain.handle('vorn:inspect-hash', (_, { hashVorn }) => {
    if (!ctx.activeStore) throw new Error('ERR_NO_STORE')
    assertHash(hashVorn)
    return getEntry(ctx.activeStore, hashVorn)
  })
  ipcMain.handle('vorn:count-store-files', () => {
    if (!ctx.activeStore) throw new Error('ERR_NO_STORE')
    return countStoreFiles(ctx.activeStore)
  })
  ipcMain.handle('vorn:list-store-files', (_, { offset, limit, query }) => {
    if (!ctx.activeStore) throw new Error('ERR_NO_STORE')
    return listStoreFiles(ctx.activeStore, offset, limit, query?.trim() ? _hashSetForQuery(ctx.activeStore, query.trim()) : null)
  })
  ipcMain.handle('vorn:delete-store-entry', (_, { hashVorn }) => {
    if (!ctx.activeStore) throw new Error('ERR_NO_STORE')
    assertHash(hashVorn)
    if (listTasks().some(t => t.status === 'running'))
      throw new Error('ERR_DELETE_IN_PROGRESS')
    deleteStoreEntry(ctx.activeStore, hashVorn)
  })
}
