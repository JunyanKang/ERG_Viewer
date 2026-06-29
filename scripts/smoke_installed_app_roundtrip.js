#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const XLSX = require('xlsx')

const DEFAULT_APP = '/Applications/ERG Viewer.app/Contents/MacOS/ERG Viewer'

async function main() {
  const repoRoot = path.join(__dirname, '..')
  const appPath = process.env.ERG_VIEWER_INSTALLED_APP || DEFAULT_APP
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

  assert(fs.existsSync(appPath), `Installed app executable not found: ${appPath}`)
  files.forEach((filePath) => assert(fs.existsSync(filePath), `Missing input file ${filePath}`))

  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-installed-export-'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-installed-open-'))
  try {
    const status = await exportFromInstalledApp(appPath, files, exportDir)
    assert(status.status === 'ok', `Installed app export status is ${status.status}`)
    assert(status.records === 54, `Expected 54 installed-app exported records, got ${status.records}`)
    assert(status.sources === files.length, `Expected ${files.length} installed-app sources, got ${status.sources}`)
    assertFile(status.projectPath, '.ep')
    assertFile(status.workbookPath, '.xlsx')
    assertFile(status.pdfPath, '.pdf')

    const workbook = XLSX.readFile(status.workbookPath)
    ;['samples', 'analysis_source', 'report_scopes', 'report_figures', 'report_readiness'].forEach((sheet) => {
      assert(workbook.SheetNames.includes(sheet), `Installed app workbook missing ${sheet}`)
    })

    const reopened = await openProjectInInstalledApp(appPath, status.projectPath, stateDir, files.length)
    assert(reopened.projectFilePath === status.projectPath, 'Installed app reopened project path mismatch')
    assert(reopened.records === status.records, `Installed app reopened records mismatch: ${reopened.records}`)
    assert(reopened.sources === status.sources, `Installed app reopened sources mismatch: ${reopened.sources}`)
    assert(reopened.gates && reopened.gates.canExportPdf, 'Installed app reopened project should allow PDF export')
    assert(reopened.gates && reopened.gates.canExportWorkbook, 'Installed app reopened project should allow workbook export')
    assert(Array.isArray(reopened.reportScopes) && reopened.reportScopes.length === 4, 'Installed app reopened project missing report scopes')

    console.log(
      [
        'installed-app-roundtrip-smoke: ok',
        `records=${reopened.records}`,
        `sources=${reopened.sources}`,
        `reportRows=${reopened.reportSourceRows}`,
        `scopes=${reopened.reportScopes.length}`,
        `project=${path.basename(status.projectPath)}`,
      ].join(' | ')
    )
  } finally {
    fs.rmSync(exportDir, { recursive: true, force: true })
    fs.rmSync(stateDir, { recursive: true, force: true })
  }
}

async function exportFromInstalledApp(appPath, files, exportDir) {
  await runInstalledApp(appPath, files, {
    ERG_VIEWER_QA_ACTIVE_STEP: 'Report',
    ERG_VIEWER_QA_EXPORT_DIR: exportDir,
    ERG_VIEWER_QA_SELECT_MODE: 'ERG',
  })
  const statusFile = fs
    .readdirSync(exportDir)
    .filter((name) => name.endsWith('-qa-status.json'))
    .map((name) => path.join(exportDir, name))[0]
  assert(statusFile, 'Installed app QA status file was not written')
  return JSON.parse(fs.readFileSync(statusFile, 'utf8'))
}

async function openProjectInInstalledApp(appPath, projectPath, stateDir, expectedSources) {
  await runInstalledApp(appPath, [projectPath], {
    ERG_VIEWER_QA_ACTIVE_STEP: 'Report',
    ERG_VIEWER_QA_STATE_DIR: stateDir,
    ERG_VIEWER_QA_EXPECTED_SOURCES: String(expectedSources),
    ERG_VIEWER_QA_SELECT_MODE: 'ERG',
  })
  const stateFile = path.join(stateDir, 'report-state.json')
  assert(fs.existsSync(stateFile), 'Installed app report state file was not written after project reopen')
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
}

function runInstalledApp(appPath, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(appPath, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Installed app smoke timed out\n${stdout}\n${stderr}`))
    }, 60000)
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
      else reject(new Error(`Installed app exited with ${code}\n${stdout}\n${stderr}`))
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
