#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

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

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-electron-interactions-'))
  try {
    const report = await runElectron(repoRoot, files, tempDir)
    assert(Array.isArray(report.cases), 'Interaction report cases missing')
    assert(report.cases.length >= 19, `Expected at least 19 interaction cases, got ${report.cases.length}`)
    const failures = report.cases.filter((row) => !row.pass)
    assert(!failures.length, `Interaction failures:\n${failures.map(describeFailure).join('\n')}`)
    assert(
      report.status === 'ok',
      [
        `Interaction report status is ${report.status}: ${(report.failures || []).join(', ')}`,
        report.controlAudit && Array.isArray(report.controlAudit.issues) && report.controlAudit.issues.length
          ? `Control coverage issues:\n${report.controlAudit.issues.join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    )
    assert(report.layout && Array.isArray(report.layout.issues), 'Interaction layout audit missing')
    assert(!report.layout.issues.length, `Post-interaction layout issues:\n${report.layout.issues.join('\n')}`)
    assert(report.controlAudit && report.controlAudit.status === 'ok', 'Control coverage audit missing or failed')
    assert(
      Array.isArray(report.controlAudit.issues) && report.controlAudit.issues.length === 0,
      `Control coverage issues:\n${(report.controlAudit.issues || []).join('\n')}`
    )
    console.log(
      [
        'electron-interaction-smoke: ok',
        `cases=${report.cases.length}`,
        `controls=${report.controlAudit.total}`,
        `reserved=${report.controlAudit.reserved}`,
        `disabled=${report.controlAudit.disabled}`,
        `records=${report.state && report.state.records}`,
        `sources=${report.state && report.state.sources}`,
        `finalStep=${report.state && report.state.activeStep}`,
      ].join(' | ')
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function runElectron(repoRoot, files, stateDir) {
  return new Promise((resolve, reject) => {
    let settled = false
    const child = spawn(electron, [repoRoot, ...files], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ERG_VIEWER_QA_ACTIVE_STEP: 'Intake',
        ERG_VIEWER_QA_INTERACTIONS: '1',
        ERG_VIEWER_QA_STATE_DIR: stateDir,
        ERG_VIEWER_QA_EXPECTED_SOURCES: String(files.length),
        ERG_VIEWER_QA_SELECT_MODE: 'ERG',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      reject(new Error(`Electron interaction smoke timed out\n${stdout}\n${stderr}`))
    }, 60000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      const report = extractReport(stdout)
      if (report && !settled) {
        settled = true
        clearTimeout(timeout)
        child.kill('SIGTERM')
        resolve(report)
      }
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      const report = extractReport(stdout)
      if (report) resolve(report)
      else if (code === 0) reject(new Error(`Electron exited without an interaction report\n${stdout}\n${stderr}`))
      else reject(new Error(`Electron exited with ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function extractReport(stdout) {
  const marker = '[qa-interaction-report]'
  const index = stdout.indexOf(marker)
  if (index === -1) return null
  const rest = stdout.slice(index + marker.length)
  const line = rest.split(/\r?\n/)[0].trim()
  if (!line) return null
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function describeFailure(row) {
  return `${row.name}: expected=${row.expected} actual=${JSON.stringify(row.actual)}`
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error))
  process.exit(1)
})
