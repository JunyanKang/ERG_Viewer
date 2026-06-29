#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const XLSX = require('xlsx')

const electron = require('electron')

async function main() {
  const repoRoot = path.join(__dirname, '..')
  const examplesDir = path.join(repoRoot, 'test-fixtures', 'opto')
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

  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-electron-project-export-'))
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-electron-project-open-'))
  try {
    const status = await exportProject(repoRoot, files, exportDir)
    assert(status.status === 'ok', `Export status is ${status.status}`)
    assertFile(status.projectPath, '.ep')
    assertFile(status.workbookPath, '.xlsx')
    assert(status.records === 54, `Expected 54 exported records, got ${status.records}`)
    assert(status.sources === files.length, `Expected ${files.length} exported sources, got ${status.sources}`)

    const exportedProject = JSON.parse(fs.readFileSync(status.projectPath, 'utf8'))
    assert(Array.isArray(exportedProject.samples), 'Exported project missing samples')
    assert(Array.isArray(exportedProject.sources), 'Exported project missing sources')

    const reopened = await openProjectSnapshot(repoRoot, status.projectPath, stateDir, files.length)
    assert(reopened.projectFilePath === status.projectPath, 'Reopened project file path mismatch')
    assert(reopened.records === status.records, `Reopened record count mismatch: ${reopened.records}`)
    assert(reopened.sources === status.sources, `Reopened source count mismatch: ${reopened.sources}`)
    assert(reopened.reportSourceRows === status.sourceRows, `Reopened report source rows mismatch: ${reopened.reportSourceRows}`)
    assert(reopened.gates && reopened.gates.canExportWorkbook, 'Reopened project should allow workbook export')
    assert(reopened.gates && reopened.gates.canExportPdf, 'Reopened project should allow PDF export')
    assert(Array.isArray(reopened.reportScopes) && reopened.reportScopes.length === 4, 'Reopened project missing report scopes')
    ;['current', 'erg-preset', 'fvep-preset', 'source-appendix'].forEach((scopeId) => {
      const scope = reopened.reportScopes.find((scope) => scope.id === scopeId)
      assert(scope && scope.records > 0, `Reopened project scope not ready: ${scopeId}`)
    })

    const workbook = XLSX.readFile(status.workbookPath)
    ;['samples', 'analysis_source', 'report_scopes', 'report_figures', 'report_readiness'].forEach((sheet) => {
      assert(workbook.SheetNames.includes(sheet), `Exported workbook missing ${sheet}`)
    })

    console.log(
      [
        'electron-project-roundtrip-smoke: ok',
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

async function exportProject(repoRoot, files, exportDir) {
  await runElectron(repoRoot, files, {
    ERG_VIEWER_QA_ACTIVE_STEP: 'Report',
    ERG_VIEWER_QA_EXPORT_DIR: exportDir,
    ERG_VIEWER_QA_SELECT_MODE: 'ERG',
  })
  const statusFile = fs
    .readdirSync(exportDir)
    .filter((name) => name.endsWith('-qa-status.json'))
    .map((name) => path.join(exportDir, name))[0]
  assert(statusFile, 'QA export status file was not written')
  return JSON.parse(fs.readFileSync(statusFile, 'utf8'))
}

async function openProjectSnapshot(repoRoot, projectPath, stateDir, expectedSources) {
  await runElectron(repoRoot, [projectPath], {
    ERG_VIEWER_QA_ACTIVE_STEP: 'Report',
    ERG_VIEWER_QA_STATE_DIR: stateDir,
    ERG_VIEWER_QA_EXPECTED_SOURCES: String(expectedSources),
    ERG_VIEWER_QA_SELECT_MODE: 'ERG',
  })
  const stateFile = path.join(stateDir, 'report-state.json')
  assert(fs.existsSync(stateFile), 'QA report state file was not written after project reopen')
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
}

function runElectron(repoRoot, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(electron, [repoRoot, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Electron project roundtrip timed out\n${stdout}\n${stderr}`))
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
