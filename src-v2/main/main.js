const { app, BrowserWindow, dialog, ipcMain, clipboard, nativeImage, Menu, screen } = require('electron')
const fs = require('fs')
const path = require('path')

const ALLOWED_READ_PATHS = new Set()
const ALLOWED_WRITE_PATHS = new Set()
const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls'])
const PROJECT_EXTENSIONS = new Set(['.ep', '.ergproject', '.json'])
const MAX_TEXT_BYTES = 12 * 1024 * 1024
const MAX_EXPORT_HTML_BYTES = 10 * 1024 * 1024
const QA_SCREENSHOT_PATH = process.env.ERG_VIEWER_QA_SCREENSHOT || ''
const QA_EXPORT_DIR = process.env.ERG_VIEWER_QA_EXPORT_DIR || ''
const QA_STATE_DIR = process.env.ERG_VIEWER_QA_STATE_DIR || ''
const MIN_WINDOW_WIDTH = 1240
const MIN_WINDOW_HEIGHT = 760

let mainWindow = null

app.setName('OptoERGViewer')
if (process.env.ERG_VIEWER_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration()
}

function normalizeFilePath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return null
  return path.resolve(filePath)
}

function hasExtension(filePath, extensions) {
  return extensions.has(path.extname(filePath || '').toLowerCase())
}

function addAllowedPath(store, filePath) {
  const normalized = normalizeFilePath(filePath)
  if (normalized) store.add(normalized)
  return normalized
}

function isAllowedPath(store, filePath) {
  const normalized = normalizeFilePath(filePath)
  return Boolean(normalized && store.has(normalized))
}

function findStartupPaths(extensions) {
  return process.argv
    .slice(1)
    .filter((arg) => {
      const normalized = normalizeFilePath(arg)
      return normalized && hasExtension(normalized, extensions) && fs.existsSync(normalized)
    })
    .map((filePath) => addAllowedPath(ALLOWED_READ_PATHS, filePath))
    .filter(Boolean)
}

function findStartupExcelPaths() {
  return findStartupPaths(EXCEL_EXTENSIONS)
}

function findStartupProjectPath() {
  return findStartupPaths(PROJECT_EXTENSIONS)[0] || ''
}

function qaExportDir() {
  if (!QA_EXPORT_DIR) return ''
  return path.resolve(QA_EXPORT_DIR)
}

function qaStateDir() {
  if (!QA_STATE_DIR) return ''
  return path.resolve(QA_STATE_DIR)
}

function ensureInsideDirectory(filePath, directoryPath) {
  const relative = path.relative(directoryPath, filePath)
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function ensureWindowVisible(win) {
  if (!win || win.isDestroyed()) return
  const primary = screen.getPrimaryDisplay()
  const workArea = primary && primary.workArea
  if (!workArea) return
  const bounds = win.getBounds()
  const width = Math.max(MIN_WINDOW_WIDTH, Math.min(bounds.width, workArea.width))
  const height = Math.max(MIN_WINDOW_HEIGHT, Math.min(bounds.height, workArea.height))
  const x = Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width))
  const y = Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height))
  win.setBounds({ x, y, width, height })
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

function createWindow() {
  const startupProjectPath = findStartupProjectPath()
  const startupFilePaths = startupProjectPath ? [] : findStartupExcelPaths()
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    backgroundColor: '#f7f8fb',
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  mainWindow = win
  win.webContents.on('console-message', (_event, level, message) => {
    console.log('[renderer]', level, message)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.log('[renderer] gone', JSON.stringify(details || {}))
  })
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.log('[renderer] did-fail-load', errorCode, errorDescription)
  })
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  win.once('ready-to-show', () => ensureWindowVisible(win))
  win.webContents.once('did-finish-load', () => {
    ensureWindowVisible(win)
    if (startupFilePaths.length) {
      win.webContents.send('startup-files', startupFilePaths)
    }
    if (startupProjectPath) {
      win.webContents.send('startup-project', startupProjectPath)
    }
    setTimeout(() => {
      writeQaScreenshot(win).catch((error) => {
        console.log('[qa] screenshot failed', error && error.message ? error.message : String(error))
      })
    }, 1400)
  })
  setTimeout(() => ensureWindowVisible(win), 700)
  setTimeout(() => ensureWindowVisible(win), 1500)
  return win
}

function installApplicationMenu() {
  const template = [
    {
      label: 'OptoERGViewer',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: 'Quit OptoERGViewer',
          accelerator: 'CommandOrControl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Quit OptoERGViewer',
          accelerator: 'CommandOrControl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function writeQaScreenshot(win) {
  if (!QA_SCREENSHOT_PATH || !win || win.isDestroyed()) return
  await new Promise((resolve) => setTimeout(resolve, 1600))
  const image = await win.webContents.capturePage()
  await fs.promises.writeFile(QA_SCREENSHOT_PATH, image.toPNG())
  console.log('[qa] screenshot written', QA_SCREENSHOT_PATH)
  if (process.env.ERG_VIEWER_QA_EXIT === '1') app.quit()
}

app.whenReady().then(() => {
  try {
    installApplicationMenu()
  } catch {}
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

ipcMain.handle('app-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
}))

ipcMain.handle('dialog:open-excel', async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import OPTOPROBE Excel',
    properties: options && options.multi ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [
      { name: 'OPTOPROBE Excel', extensions: ['xlsx', 'xls'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled) return []
  return result.filePaths.map((filePath) => addAllowedPath(ALLOWED_READ_PATHS, filePath)).filter(Boolean)
})

ipcMain.handle('dialog:open-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open OptoERGViewer Project',
    properties: ['openFile'],
    filters: [
      { name: 'OptoERGViewer Project', extensions: ['ep', 'ergproject', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePaths[0]) return ''
  return addAllowedPath(ALLOWED_READ_PATHS, result.filePaths[0])
})

ipcMain.handle('dialog:save', async (_event, options) => {
  const result = await dialog.showSaveDialog(
    mainWindow,
    options && typeof options === 'object' ? options : {}
  )
  if (result.canceled || !result.filePath) return ''
  return addAllowedPath(ALLOWED_WRITE_PATHS, result.filePath)
})

ipcMain.handle('qa:prepare-export-path', async (_event, fileName, extensions) => {
  const directoryPath = qaExportDir()
  if (!directoryPath) throw new Error('QA export directory is not configured.')
  const safeName = path.basename(String(fileName || '').trim())
  const allowedExtensions = new Set(
    (Array.isArray(extensions) ? extensions : [])
      .map((extension) => String(extension || '').replace(/^\./, '').toLowerCase())
      .filter(Boolean)
  )
  const targetPath = normalizeFilePath(path.join(directoryPath, safeName))
  const extension = path.extname(targetPath || '').replace(/^\./, '').toLowerCase()
  if (!safeName || !targetPath || !ensureInsideDirectory(targetPath, directoryPath)) {
    throw new Error('QA export path is outside the configured directory.')
  }
  if (!allowedExtensions.has(extension)) {
    throw new Error('QA export path extension is not allowed.')
  }
  await fs.promises.mkdir(directoryPath, { recursive: true })
  return addAllowedPath(ALLOWED_WRITE_PATHS, targetPath)
})

ipcMain.handle('qa:prepare-state-path', async (_event, fileName) => {
  const directoryPath = qaStateDir()
  if (!directoryPath) throw new Error('QA state directory is not configured.')
  const safeName = path.basename(String(fileName || '').trim())
  const targetPath = normalizeFilePath(path.join(directoryPath, safeName))
  if (!safeName || !targetPath || !ensureInsideDirectory(targetPath, directoryPath)) {
    throw new Error('QA state path is outside the configured directory.')
  }
  if (path.extname(targetPath).toLowerCase() !== '.json') {
    throw new Error('QA state path must be a JSON file.')
  }
  await fs.promises.mkdir(directoryPath, { recursive: true })
  return addAllowedPath(ALLOWED_WRITE_PATHS, targetPath)
})

ipcMain.handle('qa:write-state-json', async (_event, fileName, jsonText) => {
  const directoryPath = qaStateDir()
  if (!directoryPath) throw new Error('QA state directory is not configured.')
  const safeName = path.basename(String(fileName || '').trim())
  const targetPath = normalizeFilePath(path.join(directoryPath, safeName))
  const source = String(jsonText || '')
  if (!safeName || !targetPath || !ensureInsideDirectory(targetPath, directoryPath)) {
    throw new Error('QA state path is outside the configured directory.')
  }
  if (path.extname(targetPath).toLowerCase() !== '.json') {
    throw new Error('QA state path must be a JSON file.')
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_TEXT_BYTES) {
    throw new Error('QA state JSON is too large.')
  }
  await fs.promises.mkdir(directoryPath, { recursive: true })
  await fs.promises.writeFile(targetPath, source, 'utf8')
  return targetPath
})

ipcMain.handle('file:read-buffer', async (_event, filePath) => {
  const normalized = normalizeFilePath(filePath)
  if (
    !normalized ||
    !isAllowedPath(ALLOWED_READ_PATHS, normalized) ||
    !hasExtension(normalized, EXCEL_EXTENSIONS)
  ) {
    throw new Error('Read denied. Select an Excel file through the import dialog first.')
  }
  return fs.promises.readFile(normalized)
})

ipcMain.handle('file:read-text', async (_event, filePath) => {
  const normalized = normalizeFilePath(filePath)
  if (
    !normalized ||
    !isAllowedPath(ALLOWED_READ_PATHS, normalized) ||
    !hasExtension(normalized, PROJECT_EXTENSIONS)
  ) {
    throw new Error('Read denied. Select a project file through the open dialog first.')
  }
  const stat = await fs.promises.stat(normalized)
  if (stat.size > MAX_TEXT_BYTES) throw new Error('Project file is too large.')
  return fs.promises.readFile(normalized, 'utf8')
})

ipcMain.handle('file:write', async (_event, filePath, data, encoding) => {
  const normalized = normalizeFilePath(filePath)
  if (!normalized || !isAllowedPath(ALLOWED_WRITE_PATHS, normalized)) {
    throw new Error('Write denied. Choose a destination through the save dialog first.')
  }
  await fs.promises.writeFile(normalized, data, encoding || undefined)
  return normalized
})

ipcMain.handle('clipboard:write-text', (_event, text) => {
  clipboard.writeText(String(text || ''))
  return true
})

ipcMain.handle('clipboard:write-image-data-url', (_event, dataUrl) => {
  const image = nativeImage.createFromDataURL(String(dataUrl || ''))
  if (image.isEmpty()) throw new Error('Invalid image data.')
  clipboard.writeImage(image)
  return true
})

ipcMain.handle('export:pdf-from-html', async (_event, html, outPath) => {
  const normalized = normalizeFilePath(outPath)
  const source = String(html || '')
  if (!normalized || !isAllowedPath(ALLOWED_WRITE_PATHS, normalized)) {
    throw new Error('PDF export denied. Choose a destination through the save dialog first.')
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_EXPORT_HTML_BYTES)
    throw new Error('PDF export HTML is too large.')
  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(source)}`)
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    await fs.promises.writeFile(normalized, pdf)
    return normalized
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
})

ipcMain.handle('window:show-warning', async (_event, message) => {
  await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['OK'],
    message: String(message || 'Warning'),
  })
  return true
})

ipcMain.handle('window:quit', () => {
  app.quit()
})
