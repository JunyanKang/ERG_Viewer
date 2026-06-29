#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const DEFAULT_APP = '/Applications/ERG Viewer.app/Contents/MacOS/ERG Viewer'
const STEPS = ['Intake', 'Review', 'Analysis', 'Report']

async function main() {
  const repoRoot = path.join(__dirname, '..')
  const appPath = process.env.ERG_VIEWER_INSTALLED_APP || DEFAULT_APP
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

  assert(fs.existsSync(appPath), `Installed app executable not found: ${appPath}`)
  files.forEach((filePath) => assert(fs.existsSync(filePath), `Missing input file ${filePath}`))

  const summaries = []
  for (const step of STEPS) {
    const snapshot = await collectStateSnapshot(appPath, files, step)
    assertReleaseSnapshot(step, snapshot, files.length)
    summaries.push({
      step,
      controls: snapshot.layout.controls.length,
      panels: snapshot.layout.panels.length,
      fontSizes: snapshot.layout.designAudit.fontSizes,
    })
  }

  const largeBatchFiles = fs
    .readdirSync(examplesDir)
    .filter((fileName) => fileName.endsWith('.xlsx'))
    .sort()
    .map((fileName) => path.join(examplesDir, fileName))
  assert(largeBatchFiles.length >= 16, 'Installed app large-batch UI smoke needs the full demo batch')
  const largeSnapshot = await collectStateSnapshot(appPath, largeBatchFiles, 'Intake')
  assertReleaseSnapshot('IntakeLarge', largeSnapshot, largeBatchFiles.length, { largeBatch: true })
  summaries.push({
    step: 'IntakeLarge',
    controls: largeSnapshot.layout.controls.length,
    panels: largeSnapshot.layout.panels.length,
    fontSizes: largeSnapshot.layout.designAudit.fontSizes,
  })

  const interaction = await collectInteractionReport(appPath, files)
  assertInteractionReport(interaction)

  console.log(
    [
      'installed-app-ui-smoke: ok',
      `steps=${summaries.map((summary) => summary.step).join('/')}`,
      `controls=${summaries.map((summary) => `${summary.step}:${summary.controls}`).join(',')}`,
      `panels=${summaries.map((summary) => `${summary.step}:${summary.panels}`).join(',')}`,
      `interactionCases=${interaction.cases.length}`,
      `interactionControls=${interaction.controlAudit.total}`,
    ].join(' | ')
  )
}

async function collectStateSnapshot(appPath, files, step) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), `erg-viewer-installed-ui-${makeId(step)}-`))
  try {
    await runInstalledApp(appPath, files, {
      ERG_VIEWER_QA_ACTIVE_STEP: step,
      ERG_VIEWER_QA_STATE_DIR: stateDir,
      ERG_VIEWER_QA_EXPECTED_SOURCES: String(files.length),
      ERG_VIEWER_QA_SELECT_MODE: 'ERG',
    })
    const stateFile = path.join(stateDir, `${makeId(step)}-state.json`)
    assert(fs.existsSync(stateFile), `Installed app QA state file was not written for ${step}`)
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true })
  }
}

async function collectInteractionReport(appPath, files) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-installed-ui-interaction-'))
  try {
    return await runInstalledInteraction(appPath, files, {
      ERG_VIEWER_QA_ACTIVE_STEP: 'Intake',
      ERG_VIEWER_QA_INTERACTIONS: '1',
      ERG_VIEWER_QA_STATE_DIR: stateDir,
      ERG_VIEWER_QA_EXPECTED_SOURCES: String(files.length),
      ERG_VIEWER_QA_SELECT_MODE: 'ERG',
    })
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true })
  }
}

function assertReleaseSnapshot(step, snapshot, expectedSources, options = {}) {
  assert(snapshot && snapshot.activeStep, `${step} snapshot activeStep missing`)
  assert(snapshot.records >= expectedSources, `${step} expected at least ${expectedSources} records, got ${snapshot.records}`)
  assert(snapshot.sources === expectedSources, `${step} expected ${expectedSources} sources, got ${snapshot.sources}`)
  assert(snapshot.layout && typeof snapshot.layout === 'object', `${step} layout snapshot missing`)
  assert(Array.isArray(snapshot.layout.controls) && snapshot.layout.controls.length > 0, `${step} controls missing`)
  assert(Array.isArray(snapshot.layout.panels) && snapshot.layout.panels.length > 0, `${step} panels missing`)
  assert(
    Array.isArray(snapshot.layout.issues) && snapshot.layout.issues.length === 0,
    `${step} layout/design issues:\n${(snapshot.layout.issues || []).join('\n')}`
  )

  const audit = snapshot.layout.designAudit || {}
  assert(Array.isArray(audit.fontSizes) && audit.fontSizes.length <= 4, `${step} has too many font sizes`)
  assert(Array.isArray(audit.panelTitleStyles) && audit.panelTitleStyles.length === 1, `${step} panel title styles drifted`)
  assert(
    audit.formControlSummary &&
      Array.isArray(audit.formControlSummary.heights) &&
      audit.formControlSummary.heights.includes('30'),
    `${step} missing global 30px control height`
  )
  assert(snapshot.surface && typeof snapshot.surface === 'object', `${step} surface snapshot missing`)
  assert(includesAll(texts(snapshot.surface.tabs), STEPS), `${step} workflow tabs missing`)
  assert(
    includesAll(snapshot.surface.toolbarActions, ['Import Excel', 'Open Project', 'Save Project', 'Demo', 'Quit']),
    `${step} toolbar actions missing`
  )

  if (step === 'Intake' || step === 'IntakeLarge') {
    assert(includesAll(snapshot.surface.panels, ['Project Summary', 'Samples', 'Acquisition']), `${step} Intake panels missing`)
  }
  if (step === 'Review') {
    assert(includesAll(texts(snapshot.surface.reviewControls), ['Type', 'Name', 'Mode', 'Stimulus']), 'Review controls missing Type/Name/Mode/Stimulus')
  }
  if (step === 'Analysis') {
    assert(includesAll(texts(snapshot.surface.analysisControls), ['Type', 'Mode', 'Metric', 'Layer']), 'Analysis controls missing')
    assert(snapshot.gates && snapshot.gates.canCopyAnalysisCsv, 'Analysis Copy CSV gate should be enabled')
  }
  if (step === 'Report') {
    assert(includesAll(snapshot.surface.reportScopes, ['Current', 'ERG', 'FVEP', 'Appendix']), 'Report scopes missing')
    assert(snapshot.gates && snapshot.gates.canExportPdf, 'Report PDF export gate should be enabled')
  }
  if (options.largeBatch) {
    const splitStack = (snapshot.layout.verticalStacks || []).find((stack) => stack.name === 'intake-split')
    assert(splitStack, 'Installed app large Intake snapshot missing split grid')
    const cohortPanel = splitStack.items.find((item) => item.selector === '.intake-cohort-panel')
    const recordPanel = splitStack.items.find((item) => item.selector === '.intake-record-panel')
    assert(cohortPanel && recordPanel, 'Installed app large Intake split grid missing cohort/acquisition panels')
    assert(Math.abs(cohortPanel.width - recordPanel.width) <= 8, `Installed app split columns are uneven: ${cohortPanel.width}/${recordPanel.width}`)
    assert(recordPanel.height >= 220, `Installed app acquisition panel collapsed: ${recordPanel.height}`)
    assert(cohortPanel.scrollOverflowY > 0, 'Installed app large Intake should scroll inside the capped cohort panel')
  }
}

function assertInteractionReport(report) {
  assert(report.status === 'ok', `Installed app interaction status is ${report.status}: ${(report.failures || []).join(', ')}`)
  assert(Array.isArray(report.cases) && report.cases.length >= 26, `Expected at least 26 interaction cases, got ${report.cases && report.cases.length}`)
  const failures = report.cases.filter((row) => !row.pass)
  assert(!failures.length, `Installed app interaction failures:\n${failures.map((row) => row.name).join('\n')}`)
  assert(report.layout && Array.isArray(report.layout.issues) && report.layout.issues.length === 0, 'Installed app post-interaction layout issues')
  assert(report.controlAudit && report.controlAudit.status === 'ok', 'Installed app control coverage audit failed')
  assert(Array.isArray(report.controlAudit.issues) && report.controlAudit.issues.length === 0, 'Installed app control coverage issues')
  assert(report.controlAudit.total >= 84, `Installed app control audit saw too few controls: ${report.controlAudit.total}`)
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
      reject(new Error(`Installed app UI smoke timed out\n${stdout}\n${stderr}`))
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
      if (code === 0) resolve(stdout)
      else reject(new Error(`Installed app exited with ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function runInstalledInteraction(appPath, args, env) {
  return new Promise((resolve, reject) => {
    let settled = false
    const child = spawn(appPath, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      reject(new Error(`Installed app interaction smoke timed out\n${stdout}\n${stderr}`))
    }, 60000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      const report = extractInteractionReport(stdout)
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
      const report = extractInteractionReport(stdout)
      if (report) resolve(report)
      else if (code === 0) reject(new Error(`Installed app exited without an interaction report\n${stdout}\n${stderr}`))
      else reject(new Error(`Installed app exited with ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function extractInteractionReport(stdout) {
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

function texts(values) {
  return (values || [])
    .map((value) => (typeof value === 'string' ? value : value && (value.text || value.label)))
    .filter(Boolean)
}

function includesAll(values, expected) {
  const set = new Set((values || []).filter(Boolean))
  return expected.every((item) => set.has(item))
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
