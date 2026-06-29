#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const XLSX = require('xlsx')

const electron = require('electron')

const REQUIRED_STATUS_KEYS = ['projectPath', 'workbookPath', 'pdfPath', 'records', 'sources', 'sourceRows', 'sheets']

async function main() {
  const repoRoot = path.join(__dirname, '..')
  const examplesDir = path.join(repoRoot, 'docs', 'examples')
  const files =
    process.argv.length > 2
      ? process.argv.slice(2).map((filePath) => path.resolve(filePath))
      : [
          path.join(examplesDir, 'demo-control-1_FERG.xlsx'),
          path.join(examplesDir, 'demo-cko-1_FERG.xlsx'),
          path.join(examplesDir, 'demo-control-1_FVEP.xlsx'),
          path.join(examplesDir, 'demo-cko-1_FVEP.xlsx'),
        ]
  files.forEach((filePath) => assert(fs.existsSync(filePath), `Missing input file ${filePath}`))

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-electron-export-'))
  try {
    await runElectron(repoRoot, files, tempDir)
    const statusFile = fs
      .readdirSync(tempDir)
      .filter((name) => name.endsWith('-qa-status.json'))
      .map((name) => path.join(tempDir, name))[0]
    assert(statusFile, 'QA status file was not written')
    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'))
    REQUIRED_STATUS_KEYS.forEach((key) => assert(Object.prototype.hasOwnProperty.call(status, key), `Status missing ${key}`))
    assert(status.status === 'ok', 'QA status is not ok')
    assert(status.records >= files.length, `Expected at least ${files.length} records, got ${status.records}`)
    assert(status.sources === files.length, `Expected ${files.length} sources, got ${status.sources}`)
    assert(status.sourceRows > 0, 'Expected source rows in exported status')
    assert(Array.isArray(status.sheets) && status.sheets.includes('analysis_source'), 'Status missing analysis_source sheet')

    assertFile(status.projectPath, '.ep')
    assertFile(status.workbookPath, '.xlsx')
    assertFile(status.pdfPath, '.pdf')

    const project = JSON.parse(fs.readFileSync(status.projectPath, 'utf8'))
    assert(Array.isArray(project.samples) && project.samples.length === status.records, 'Saved project record count mismatch')
    assert(Array.isArray(project.sources) && project.sources.length === status.sources, 'Saved project source count mismatch')

    const workbook = XLSX.readFile(status.workbookPath)
    ;['samples', 'analysis_source', 'report_scopes', 'report_figures', 'report_readiness'].forEach((sheet) => {
      assert(workbook.SheetNames.includes(sheet), `Exported workbook missing ${sheet}`)
    })
    const analysisRows = XLSX.utils.sheet_to_json(workbook.Sheets.analysis_source, { header: 1 })
    assert(analysisRows.length > 1, 'Exported workbook analysis_source has no data rows')

    const pdfHeader = fs.readFileSync(status.pdfPath).subarray(0, 4).toString('utf8')
    assert(pdfHeader === '%PDF', 'Exported PDF does not have a PDF header')

    console.log(
      [
        'electron-export-smoke: ok',
        `records=${status.records}`,
        `sources=${status.sources}`,
        `sourceRows=${status.sourceRows}`,
        `sheets=${status.sheets.length}`,
        `pdf=${path.basename(status.pdfPath)}`,
      ].join(' | ')
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function runElectron(repoRoot, files, exportDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(electron, [repoRoot, ...files], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ERG_VIEWER_QA_ACTIVE_STEP: 'Report',
        ERG_VIEWER_QA_EXPORT_DIR: exportDir,
        ERG_VIEWER_QA_SELECT_MODE: 'ERG',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Electron export smoke timed out\n${stdout}\n${stderr}`))
    }, 45000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`Electron exited with ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function assertFile(filePath, extension) {
  assert(filePath && path.extname(filePath) === extension, `Expected ${extension} path, got ${filePath}`)
  assert(fs.existsSync(filePath), `Expected file to exist: ${filePath}`)
  assert(fs.statSync(filePath).size > 0, `Expected non-empty file: ${filePath}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error))
  process.exit(1)
})
