const { contextBridge, ipcRenderer } = require('electron')

let pendingStartupFiles = []
let pendingStartupProject = ''

ipcRenderer.on('startup-file', (_event, filePath) => {
  pendingStartupFiles = [String(filePath || '')].filter(Boolean)
})

ipcRenderer.on('startup-files', (_event, filePaths) => {
  pendingStartupFiles = Array.isArray(filePaths)
    ? filePaths.map((filePath) => String(filePath || '')).filter(Boolean)
    : []
})

ipcRenderer.on('startup-project', (_event, filePath) => {
  pendingStartupProject = String(filePath || '')
})

contextBridge.exposeInMainWorld('ergAPI', {
  appInfo: () => ipcRenderer.invoke('app-info'),
  openExcel: (options) =>
    ipcRenderer.invoke('dialog:open-excel', options && typeof options === 'object' ? options : {}),
  openProject: () => ipcRenderer.invoke('dialog:open-project'),
  saveDialog: (options) =>
    ipcRenderer.invoke('dialog:save', options && typeof options === 'object' ? options : {}),
  readFileBuffer: (filePath) => ipcRenderer.invoke('file:read-buffer', String(filePath || '')),
  readTextFile: (filePath) => ipcRenderer.invoke('file:read-text', String(filePath || '')),
  writeFile: (filePath, data, encoding) =>
    ipcRenderer.invoke('file:write', String(filePath || ''), data, encoding),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:write-text', String(text || '')),
  writeClipboardImage: (dataUrl) =>
    ipcRenderer.invoke('clipboard:write-image-data-url', String(dataUrl || '')),
  exportPdfFromHtml: (html, outPath) =>
    ipcRenderer.invoke('export:pdf-from-html', String(html || ''), String(outPath || '')),
  prepareQaExportPath: (fileName, extensions) =>
    ipcRenderer.invoke(
      'qa:prepare-export-path',
      String(fileName || ''),
      Array.isArray(extensions) ? extensions.map((extension) => String(extension || '')) : []
  ),
  prepareQaStatePath: (fileName) => ipcRenderer.invoke('qa:prepare-state-path', String(fileName || '')),
  writeQaStateJson: (fileName, jsonText) =>
    ipcRenderer.invoke('qa:write-state-json', String(fileName || ''), String(jsonText || '')),
  showWarning: (message) => ipcRenderer.invoke('window:show-warning', String(message || '')),
  quit: () => ipcRenderer.invoke('window:quit'),
  getQaSelectMode: () => String(process.env.ERG_VIEWER_QA_SELECT_MODE || ''),
  getQaActiveStep: () => String(process.env.ERG_VIEWER_QA_ACTIVE_STEP || ''),
  getQaAnalysisCondition: () => String(process.env.ERG_VIEWER_QA_ANALYSIS_CONDITION || ''),
  getQaManualPick: () => String(process.env.ERG_VIEWER_QA_MANUAL_PICK || ''),
  getQaExportDir: () => String(process.env.ERG_VIEWER_QA_EXPORT_DIR || ''),
  getQaStateDir: () => String(process.env.ERG_VIEWER_QA_STATE_DIR || ''),
  getQaExpectedSources: () => String(process.env.ERG_VIEWER_QA_EXPECTED_SOURCES || ''),
  getQaExpectedSourceNames: () => String(process.env.ERG_VIEWER_QA_EXPECTED_SOURCE_NAMES || ''),
  getQaInteractionSmoke: () => String(process.env.ERG_VIEWER_QA_INTERACTIONS || ''),
  getQaQuitSmoke: () => String(process.env.ERG_VIEWER_QA_QUIT || ''),
  getQaQuitTarget: () => String(process.env.ERG_VIEWER_QA_QUIT_TARGET || ''),
  getStartupFiles: () => {
    const filePaths = pendingStartupFiles
    pendingStartupFiles = []
    return filePaths
  },
  getStartupProject: () => {
    const filePath = pendingStartupProject
    pendingStartupProject = ''
    return filePath
  },
  getStartupFile: () => {
    const filePath = pendingStartupFiles[0] || ''
    pendingStartupFiles = []
    return filePath
  },
  onStartupFiles: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, filePaths) => {
      pendingStartupFiles = []
      callback(
        Array.isArray(filePaths) ? filePaths.map((filePath) => String(filePath || '')).filter(Boolean) : []
      )
    }
    ipcRenderer.on('startup-files', handler)
    return () => ipcRenderer.removeListener('startup-files', handler)
  },
  onStartupProject: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, filePath) => {
      pendingStartupProject = ''
      callback(String(filePath || ''))
    }
    ipcRenderer.on('startup-project', handler)
    return () => ipcRenderer.removeListener('startup-project', handler)
  },
  onStartupFile: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, filePath) => {
      pendingStartupFiles = []
      callback(String(filePath || ''))
    }
    ipcRenderer.on('startup-file', handler)
    return () => ipcRenderer.removeListener('startup-file', handler)
  },
})

try {
  contextBridge.exposeInMainWorld('ergLibs', {
    React: require('react'),
    ReactDOM: require('react-dom'),
    XLSX: require('xlsx'),
    Plotly: require('plotly.js-dist-min'),
  })
} catch {
  contextBridge.exposeInMainWorld('ergLibs', {})
}
