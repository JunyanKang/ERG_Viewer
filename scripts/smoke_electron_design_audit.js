#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const electron = require('electron')

const STEPS = ['Intake', 'Review', 'Analysis', 'Report']

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

  const summaries = []
  for (const step of STEPS) {
    summaries.push(await auditStep(repoRoot, files, step))
  }

  const largeBatchFiles = fs
    .readdirSync(examplesDir)
    .filter((fileName) => fileName.endsWith('.xlsx'))
    .sort()
    .map((fileName) => path.join(examplesDir, fileName))
  if (!process.argv.slice(2).length && largeBatchFiles.length >= 16) {
    summaries.push(await auditStep(repoRoot, largeBatchFiles, 'Intake', 'IntakeLarge'))
  }

  console.log(
    [
      'electron-design-audit-smoke: ok',
      `steps=${summaries.map((summary) => summary.step).join('/')}`,
      `fontSizes=${summaries.map((summary) => `${summary.step}:${summary.fontSizes.join(',')}`).join('|')}`,
      `controls=${summaries.map((summary) => `${summary.step}:${summary.controls}`).join(',')}`,
      `panels=${summaries.map((summary) => `${summary.step}:${summary.panels}`).join(',')}`,
    ].join(' | ')
  )
}

async function auditStep(repoRoot, files, activeStep, label = activeStep) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `erg-viewer-electron-design-${label.toLowerCase()}-`))
  try {
    await runElectron(repoRoot, files, tempDir, activeStep)
    const stateFile = path.join(tempDir, `${makeId(activeStep)}-state.json`)
    assert(fs.existsSync(stateFile), `QA state file was not written for ${label}`)
    const snapshot = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    assertDesignAudit(label, snapshot)
    return {
      step: label,
      controls: snapshot.layout.controls.length,
      panels: snapshot.layout.panels.length,
      fontSizes: snapshot.layout.designAudit.fontSizes,
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function runElectron(repoRoot, files, stateDir, activeStep) {
  return new Promise((resolve, reject) => {
    const child = spawn(electron, [repoRoot, ...files], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ERG_VIEWER_QA_ACTIVE_STEP: activeStep,
        ERG_VIEWER_QA_STATE_DIR: stateDir,
        ERG_VIEWER_QA_EXPECTED_SOURCES: String(files.length),
        ERG_VIEWER_QA_SELECT_MODE: 'ERG',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Electron design audit timed out on ${activeStep}\n${stdout}\n${stderr}`))
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
      else reject(new Error(`Electron exited with ${code} on ${activeStep}\n${stdout}\n${stderr}`))
    })
  })
}

function assertDesignAudit(step, snapshot) {
  assert(snapshot && snapshot.activeStep, `${step} snapshot activeStep missing`)
  assert(snapshot.layout && typeof snapshot.layout === 'object', `${step} layout snapshot missing`)
  assert(
    Array.isArray(snapshot.layout.issues) && snapshot.layout.issues.length === 0,
    `${step} layout/design issues:\n${(snapshot.layout.issues || []).join('\n')}`
  )
  const audit = snapshot.layout.designAudit
  assert(audit && typeof audit === 'object', `${step} design audit missing`)
  assert(Array.isArray(audit.fontSizes), `${step} design audit fontSizes missing`)
  assert(audit.fontSizes.length <= 4, `${step} has too many runtime font sizes: ${audit.fontSizes.join(',')}`)
  assert(
    Array.isArray(audit.panelTitleStyles) && audit.panelTitleStyles.length === 1,
    `${step} panel title styles are inconsistent: ${(audit.panelTitleStyles || []).join(',')}`
  )
  assert(audit.formControlSummary && audit.formControlSummary.count > 0, `${step} form control summary missing`)
  assert(
    audit.formControlSummary.fontSizes.length === 1 && audit.formControlSummary.fontSizes[0] === '12px',
    `${step} control font sizes are inconsistent: ${audit.formControlSummary.fontSizes.join(',')}`
  )
  assert(
    audit.formControlSummary.heights.includes('30'),
    `${step} control height token missing: ${audit.formControlSummary.heights.join(',')}`
  )
}

function makeId(value) {
  return (
    String(value || 'sample')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'sample'
  )
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error))
  process.exit(1)
})
