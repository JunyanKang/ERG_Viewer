const { app, BrowserWindow, dialog, ipcMain, clipboard, nativeImage, Menu, screen } = require('electron')
const path = require('path')
const fs = require('fs')
// network/crypto modules not needed after removing usage tracking

const ALLOWED_READ_PATHS = new Set()
const ALLOWED_WRITE_PATHS = new Set()
const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls'])
const MAX_EXPORT_HTML_BYTES = 8 * 1024 * 1024

function findStartupExcelPath() {
  const candidate = process.argv.slice(1).find((arg) => {
    const normalized = normalizeFilePath(arg)
    return normalized && hasExtension(normalized, EXCEL_EXTENSIONS) && fs.existsSync(normalized)
  })
  return candidate ? addAllowedPath(ALLOWED_READ_PATHS, candidate) : null
}

function normalizeFilePath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return null
  return path.resolve(filePath)
}

function hasExtension(filePath, extensions) {
  const ext = path.extname(filePath || '').toLowerCase()
  return extensions.has(ext)
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

function sanitizeThemeValue(value, fallback) {
  const str = typeof value === 'string' ? value.trim() : ''
  return /^[#(),.%\w\s-]+$/.test(str) ? str : fallback
}

// Window size presets by layout/mode (no autoHeight/limits)
const UI_SIZES = {
  main: {
    compact: { width: 960, height: 500 },
    expanded: { width: 1250, height: 705 },
    single:   { width: 880,  height: 705 }
  },
  modes: {
    dRod_dMax_lCone: 705,
    dOps: 755,
    lFlicker: 675,
    FVEP: 705
  },
  about: { width: 600, height: 690 },
  theme: { width: 250, height: 400 }
}


function createWindow () {
  const startupFilePath = findStartupExcelPath()
  const win = new BrowserWindow({
    width: UI_SIZES.main.compact.width,
    height: UI_SIZES.main.compact.height,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  // Hide menu bar completely on Windows
  try { win.setMenuBarVisibility(false) } catch (_e) {}

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  win.webContents.once('did-finish-load', () => {
    if (startupFilePath) {
      try { win.webContents.send('startup-file', startupFilePath) } catch (_e) {}
    }
  })
  win.once('ready-to-show', () => {
    try { win.show() } catch (_e) {}
  })
}

app.whenReady().then(() => {
  // Remove default application menu on Windows
  if (process.platform === 'win32') {
    try { Menu.setApplicationMenu(null) } catch (_e) {}
  }
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('show-open-dialog', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Excel', extensions: ['xlsx', 'xls'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (!result.canceled && Array.isArray(result.filePaths)) {
    result.filePaths.forEach((filePath) => {
      const normalized = normalizeFilePath(filePath)
      if (normalized && hasExtension(normalized, EXCEL_EXTENSIONS)) ALLOWED_READ_PATHS.add(normalized)
    })
  }
  return result
})

ipcMain.handle('show-warning', async (event, message) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  await dialog.showMessageBox(win || null, {
    type: 'warning',
    title: '提示',
    message: message || '请选择标准的OPTOPROBE导出文件进行分析',
    buttons: ['关闭'],
    defaultId: 0,
    noLink: true
  })
  return { ok: true }
})

ipcMain.handle('read-file-buffer', async (event, filePath) => {
  try {
    const normalized = normalizeFilePath(filePath)
    if (!normalized || !hasExtension(normalized, EXCEL_EXTENSIONS) || !isAllowedPath(ALLOWED_READ_PATHS, normalized)) {
      return { ok: false, error: 'file path is not allowed' }
    }
    const buf = fs.readFileSync(normalized)
    return { ok: true, data: buf }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(options || {})
  if (!result.canceled && result.filePath) addAllowedPath(ALLOWED_WRITE_PATHS, result.filePath)
  return result
})

ipcMain.handle('write-file', async (event, filePath, data, encoding) => {
  try {
    const normalized = normalizeFilePath(filePath)
    if (!normalized || !isAllowedPath(ALLOWED_WRITE_PATHS, normalized)) {
      return { ok: false, error: 'file path is not allowed' }
    }
    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(normalized, data)
    } else if (typeof data === 'string') {
      fs.writeFileSync(normalized, data, encoding || 'utf8')
    } else if (data && data.type === 'base64') {
      fs.writeFileSync(normalized, Buffer.from(data.data, 'base64'))
    } else {
      fs.writeFileSync(normalized, Buffer.from(data))
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('clipboard-write-text', (event, text) => {
  clipboard.writeText(text || '')
  return { ok: true }
})

ipcMain.handle('clipboard-write-image-dataurl', async (event, dataUrl) => {
  try{
    if(!dataUrl){ return { ok:false, error:'empty dataUrl'} }
    const img = nativeImage.createFromDataURL(dataUrl)
    if(img.isEmpty()){
      clipboard.writeText(dataUrl)
    }else{
      clipboard.writeImage(img)
    }
    return { ok: true }
  }catch(e){
    clipboard.writeText(dataUrl || '')
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('quit-app', () => {
  app.quit()
})

// Expose env/config for peer sync
// removed usage/env IPC handlers

// Simple About modal window with usage info
ipcMain.handle('open-about', (_event, themeVars) => {
  const about = new BrowserWindow({
    width: UI_SIZES.about.width,
    height: UI_SIZES.about.height,
    title: '关于 ERG Viewer',
    resizable: false,
    minimizable: false,
    maximizable: false,
    modal: true,
    parent: BrowserWindow.getFocusedWindow(),
    webPreferences: { contextIsolation: true }
  })
  const tv = themeVars || {}
  const bg = sanitizeThemeValue(tv.bg || tv['--bg'], '#FAF7F2')
  const card = sanitizeThemeValue(tv.card || tv['--card-bg'], '#FFF9F1')
  const fg = sanitizeThemeValue(tv.fg || tv['--fg'], '#2F2A26')
  const muted = sanitizeThemeValue(tv.muted || tv['--muted'], '#6B5F57')
  const accent = sanitizeThemeValue(tv.accent || tv['--primary'], '#8BB9F1')
  const html = `<!doctype html><html><head><meta charset='utf-8'><style>
    :root{--bg:${bg};--card:${card};--fg:${fg};--muted:${muted};--accent:${accent}}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:var(--bg);color:var(--fg);font-size:13px}
    .wrap{padding:24px}
    .brand{display:flex;align-items:center;justify-content:center;margin-bottom:12px}
    .title{font-size:16px;font-weight:600}
    .version{display:none}
    .card{background:var(--card);border:1px solid #E8E1D9;border-radius:8px;padding:14px;margin-top:10px;box-shadow:0 8px 20px rgba(40,52,70,.08)}
    h2{font-size:13px;margin:0 0 6px;opacity:.9}
    p{margin:6px 0;opacity:.92;line-height:1.5}
    ul{margin:6px 0 0 18px;opacity:.92;line-height:1.6}
    code{background:#FFF7EC;padding:2px 6px;border-radius:4px}
    .footer{display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:12px;color:var(--muted)}
    .btn{margin-top:12px;padding:8px 12px;border-radius:8px;border:1px solid #E8E1D9;background:var(--accent);color:#163052;cursor:pointer;font-size:12px}
  </style></head><body><div class='wrap'>
    <div class='brand'>
      <div class='title'>ERG Viewer</div>
      <div class='version'></div>
    </div>
    <div class='card'>
      <h2>产品概述</h2>
      <p>ERG Viewer 提供从数据加载、参数解析到波形可视化与交互标注的一体化体验，助力高效可靠的视觉电生理分析。</p>
    </div>
    <div class='card'>
      <h2>核心能力</h2>
      <ul>
        <li>数据管理：一键加载 .xlsx/.xls，自动识别与分组检测参数</li>
        <li>波形查看：左右眼并排对比，支持坐标范围调整、步进与重置</li>
        <li>标注分析：Rod/Max/Cone 支持 a/b 波标注；Ops 支持逐列标注并计算 ∑O；FVEP 支持 N1/P1/N2/P2 标注</li>
        <li>闪烁分析：Flicker 展示机器识别结果和基于傅里叶分量重新计算的幅值/相位</li>
        <li>导出共享：导出 SVG/PDF 图像与 Excel 数据，或复制图像/数据至剪贴板</li>
      </ul>
    </div>
    <div class='card'>
      <h2>使用建议</h2>
      <ul>
        <li>确保导入为标准 OPTOPROBE 导出格式，包含完整的记录数据</li>
        <li>在标注模式下使用十字参考线进行精确拾取；可重置坐标轴回到初始范围</li>
        <li>根据工作环境切换合适主题（右上角“配色”），获得更舒适的观看体验</li>
        <li>导出前请复核标注结果与坐标范围，确保图文一致</li>
      </ul>
    </div>
    <div class='card'>
      <h2>版权</h2>
      <p>© 上海交通大学医学院附属第九人民医院 KangLab（上海九院眼科）</p>
    </div>
    <div class='footer'>
      <div>若需帮助或改进建议，请反馈至开发团队。</div>
      <button class='btn' onclick='window.close()'>关闭</button>
    </div>
  </div></body></html>`
  about.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
})

// Export a standalone SVG/PNG to PDF using hidden window and printToPDF
ipcMain.handle('export-pdf-from-html', async (event, htmlContent, filePath) => {
  const normalized = normalizeFilePath(filePath)
  if (!normalized || !isAllowedPath(ALLOWED_WRITE_PATHS, normalized)) {
    return { ok: false, error: 'file path is not allowed' }
  }
  if (typeof htmlContent !== 'string' || Buffer.byteLength(htmlContent, 'utf8') > MAX_EXPORT_HTML_BYTES) {
    return { ok: false, error: 'export content is invalid or too large' }
  }
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent))
  try {
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      marginsType: 1
    })
    fs.writeFileSync(normalized, pdf)
    win.destroy()
    return { ok: true }
  } catch (e) {
    win.destroy()
    return { ok: false, error: e.message }
  }
})

// Cache last applied content size per window to avoid redundant resizes (which can cause flicker on Windows)
const LAST_CONTENT_SIZE = new WeakMap()

// Simple sizing IPCs for renderer-driven, per-mode sizing
ipcMain.handle('resize-window', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if(!win) return { ok:false, error:'no window' }
  const w = Math.round(Number(width) || 0)
  const h = Math.round(Number(height) || 0)
  try {
    // Skip if size is unchanged
    const last = LAST_CONTENT_SIZE.get(win)
    if(last && last.w === w && last.h === h){ return { ok:true, skipped:true } }

    // Compute frame delta and apply one atomic setBounds to minimize flicker (esp. on Windows)
    const cs = win.getContentSize()  // [cw, ch]
    const os = win.getSize()         // [ow, oh]
    const dw = (os[0] - cs[0])
    const dh = (os[1] - cs[1])
    const b = win.getBounds()        // {x,y,width,height}
    const next = { x: b.x, y: b.y, width: w + dw, height: h + dh }
    const display = screen.getDisplayMatching(b)
    const area = display && display.workArea ? display.workArea : null
    if(area){
      if(next.width <= area.width){
        next.x = Math.min(Math.max(next.x, area.x), area.x + area.width - next.width)
      }
      if(next.height <= area.height){
        next.y = Math.min(Math.max(next.y, area.y), area.y + area.height - next.height)
      }
    }
    win.setBounds(next, false)

    LAST_CONTENT_SIZE.set(win, { w, h })
  } catch (e) { return { ok:false, error: e.message } }
  return { ok:true }
})

ipcMain.handle('get-ui-sizes', () => ({ ok:true, data: UI_SIZES }))
