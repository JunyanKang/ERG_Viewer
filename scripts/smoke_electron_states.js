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

  const snapshots = []
  for (const step of STEPS) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `erg-viewer-electron-state-${step.toLowerCase()}-`))
    try {
      await runElectron(repoRoot, files, tempDir, step)
      const stateFile = path.join(tempDir, `${makeId(step)}-state.json`)
      assert(fs.existsSync(stateFile), `QA state file was not written for ${step}`)
      const snapshot = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
      assertSnapshot(step, snapshot, files.length)
      snapshots.push(snapshot)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }

  console.log(
    [
      'electron-state-smoke: ok',
      `steps=${snapshots.map((snapshot) => snapshot.activeStep).join('/')}`,
      `records=${snapshots[0].records}`,
      `sources=${snapshots[0].sources}`,
      `analysisRows=${snapshots.find((snapshot) => snapshot.activeStep === 'Analysis').analysisSourceRows}`,
      `reportRows=${snapshots.find((snapshot) => snapshot.activeStep === 'Report').reportSourceRows}`,
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
      reject(new Error(`Electron state smoke timed out on ${activeStep}\n${stdout}\n${stderr}`))
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

function assertSnapshot(step, snapshot, expectedSources) {
  assert(snapshot && typeof snapshot === 'object', `${step} snapshot is not an object`)
  assert(snapshot.activeStep === step, `${step} snapshot activeStep mismatch: ${snapshot.activeStep}`)
  assert(snapshot.records === 54, `${step} expected 54 records, got ${snapshot.records}`)
  assert(snapshot.sources === expectedSources, `${step} expected ${expectedSources} sources, got ${snapshot.sources}`)
  assert(snapshot.visibleRecords > 0, `${step} expected visible records`)
  assert(snapshot.gates && snapshot.gates.hasSelectedSample, `${step} expected selected sample gate`)
  assert(snapshot.selectedSampleId, `${step} expected selected sample id`)
  assert(snapshot.selectedMode, `${step} expected selected mode`)

  if (step === 'Intake') {
    assert(
      snapshot.surface &&
        Array.isArray(snapshot.surface.filters) &&
        snapshot.surface.filters.length > 0,
      'Intake should expose acquisition mode filters inside the page'
    )
  }
  if (step === 'Review') {
    assert(snapshot.gates.canReview, 'Review should be enabled after import')
  }
  if (step === 'Analysis') {
    assert(snapshot.analysisSourceRows > 0, 'Analysis expected source rows')
    assert(snapshot.sourceRows > 0, 'Analysis expected copyable source rows')
    assert(snapshot.gates.canCopyAnalysisCsv, 'Analysis Copy CSV gate should be enabled')
    assert(snapshot.gates.canExportWorkbook, 'Analysis workbook export gate should be enabled')
  }
  if (step === 'Report') {
    assert(snapshot.reportSourceRows > 0, 'Report expected source rows')
    assert(snapshot.reportScopes.length === 4, `Report expected 4 scopes, got ${snapshot.reportScopes.length}`)
    assert(snapshot.gates.canExportPdf, 'Report PDF export gate should be enabled')
    assert(snapshot.gates.canExportWorkbook, 'Report workbook export gate should be enabled')
  }
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
