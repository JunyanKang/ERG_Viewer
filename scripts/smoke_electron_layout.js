#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const electron = require('electron')

const STEPS = ['Intake', 'Review', 'Analysis', 'Report']

async function main() {
  const repoRoot = path.join(__dirname, '..')
  const examplesDir = path.join(repoRoot, 'test-fixtures', 'opto')
  const hasCustomFiles = process.argv.length > 2
  const files = hasCustomFiles
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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `erg-viewer-electron-layout-${step.toLowerCase()}-`))
    try {
      await runElectron(repoRoot, files, tempDir, step)
      const stateFile = path.join(tempDir, `${makeId(step)}-state.json`)
      assert(fs.existsSync(stateFile), `QA state file was not written for ${step}`)
      const snapshot = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
      assertLayout(step, snapshot)
      summaries.push({
        step,
        controls: snapshot.layout.controls.length,
        panels: snapshot.layout.panels.length,
        issues: snapshot.layout.issues.length,
      })
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }

  if (!hasCustomFiles) {
    const largeBatchFiles = fs
      .readdirSync(examplesDir)
      .filter((fileName) => fileName.endsWith('.xlsx'))
      .sort()
      .map((fileName) => path.join(examplesDir, fileName))
    assert(largeBatchFiles.length >= 16, 'Large Intake layout smoke needs the full demo batch')
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-electron-layout-intake-large-'))
    try {
      await runElectron(repoRoot, largeBatchFiles, tempDir, 'Intake')
      const stateFile = path.join(tempDir, `${makeId('Intake')}-state.json`)
      assert(fs.existsSync(stateFile), 'QA state file was not written for large Intake batch')
      const snapshot = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
      assertLayout('Intake', snapshot)
      const splitStack = (snapshot.layout.verticalStacks || []).find((stack) => stack.name === 'intake-split')
      assert(splitStack, 'Large Intake snapshot missing split grid metrics')
      const cohortPanel = splitStack.items.find((item) => item.selector === '.intake-cohort-panel')
      const recordPanel = splitStack.items.find((item) => item.selector === '.intake-record-panel')
      assert(cohortPanel && recordPanel, 'Large Intake split grid missing cohort/acquisition panels')
      assert(Math.abs(cohortPanel.width - recordPanel.width) <= 8, `Large Intake split columns are uneven: ${cohortPanel.width}/${recordPanel.width}`)
      assert(recordPanel.height >= 220, `Large Intake acquisition panel collapsed: ${recordPanel.height}`)
      assert(cohortPanel.scrollOverflowY > 0, 'Large Intake cohort list should scroll inside the capped panel')
      summaries.push({
        step: 'IntakeLarge',
        controls: snapshot.layout.controls.length,
        panels: snapshot.layout.panels.length,
        issues: snapshot.layout.issues.length,
      })
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }

  console.log(
    [
      'electron-layout-smoke: ok',
      `steps=${summaries.map((summary) => summary.step).join('/')}`,
      `controls=${summaries.map((summary) => `${summary.step}:${summary.controls}`).join(',')}`,
      `panels=${summaries.map((summary) => `${summary.step}:${summary.panels}`).join(',')}`,
    ].join(' | ')
  )
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
      reject(new Error(`Electron layout smoke timed out on ${activeStep}\n${stdout}\n${stderr}`))
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
      else reject(new Error(`Electron exited with ${code} on ${activeStep}\n${stdout}\n${stderr}`))
    })
  })
}

function assertLayout(step, snapshot) {
  assert(snapshot && snapshot.activeStep === step, `${step} snapshot activeStep mismatch`)
  assert(snapshot.layout && typeof snapshot.layout === 'object', `${step} layout snapshot missing`)
  assert(Array.isArray(snapshot.layout.controls), `${step} layout controls missing`)
  assert(Array.isArray(snapshot.layout.panels), `${step} layout panels missing`)
  assert(snapshot.layout.controls.length > 0, `${step} expected visible controls`)
  assert(snapshot.layout.panels.length > 0, `${step} expected visible panels`)
  assert(
    Array.isArray(snapshot.layout.issues) && snapshot.layout.issues.length === 0,
    `${step} layout issues:\n${(snapshot.layout.issues || []).join('\n')}`
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
