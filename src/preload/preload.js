const { contextBridge, ipcRenderer } = require('electron')

let pendingStartupFile = ''
ipcRenderer.on('startup-file', (_event, filePath) => {
  pendingStartupFile = String(filePath || '')
})

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('show-open-dialog'),
  readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', String(filePath || '')),
  saveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options && typeof options === 'object' ? options : {}),
  writeFile: (filePath, data, encoding) => ipcRenderer.invoke('write-file', String(filePath || ''), data, encoding),
  clipboardWriteText: (text) => ipcRenderer.invoke('clipboard-write-text', String(text || '')),
  clipboardWriteImageDataURL: (dataUrl) => ipcRenderer.invoke('clipboard-write-image-dataurl', String(dataUrl || '')),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  openAbout: (themeVars) => ipcRenderer.invoke('open-about', themeVars || {}),
  exportPdfFromHtml: (html, outPath) => ipcRenderer.invoke('export-pdf-from-html', String(html || ''), String(outPath || '')),
  getStartupFile: () => {
    const filePath = pendingStartupFile
    pendingStartupFile = ''
    return filePath
  },
  onStartupFile: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, filePath) => {
      pendingStartupFile = ''
      callback(String(filePath || ''))
    }
    ipcRenderer.on('startup-file', handler)
    return () => ipcRenderer.removeListener('startup-file', handler)
  },
  // basic window sizing (no auto height/limits)
  resizeWindow: (w,h) => ipcRenderer.invoke('resize-window', w, h),
  getUiSizes: () => ipcRenderer.invoke('get-ui-sizes'),
  showWarning: (msg) => ipcRenderer.invoke('show-warning', msg)
})

// Expose essential UI libraries to the renderer to avoid CSP/file:// issues
try{
  const React = require('react')
  const ReactDOM = require('react-dom')
  const XLSX = require('xlsx')
  const Plotly = require('plotly.js-dist-min')
  contextBridge.exposeInMainWorld('libs', { React, ReactDOM, XLSX, Plotly })
}catch(_e){ /* ignore, renderer will fall back if needed */ }
