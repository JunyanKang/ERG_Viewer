#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const electron = require('electron')

const DEFAULT_APP = '/Applications/OptoERGViewer.app/Contents/MacOS/OptoERGViewer'
const DEFAULT_FILES = [
  'demo-control-1_FERG.xlsx',
  'demo-cko-1_FERG.xlsx',
  'demo-control-1_FVEP.xlsx',
  'demo-cko-1_FVEP.xlsx',
]
const REPORT_DIR = path.join(
  __dirname,
  '..',
  'docs',
  'qa',
  '2026-06-28-global-redesign-round-65-control-interaction-ledger'
)
const REPORT_PATH = path.join(REPORT_DIR, 'CONTROL_INTERACTION_LEDGER.md')

async function main() {
  const repoRoot = path.join(__dirname, '..')
  const appPath = process.env.ERG_VIEWER_INSTALLED_APP || DEFAULT_APP
  const examplesDir = path.join(repoRoot, 'test-fixtures', 'opto')
  const files =
    process.argv.length > 2
      ? process.argv.slice(2).map((filePath) => path.resolve(filePath))
      : DEFAULT_FILES.map((name) => path.join(examplesDir, name))

  assert(fs.existsSync(appPath), `Installed app executable not found: ${appPath}`)
  files.forEach((filePath) => assert(fs.existsSync(filePath), `Missing input file ${filePath}`))

  const devReport = await collectElectronReport(repoRoot, files)
  const installedReport = await collectInstalledReport(appPath, files)
  assertInteractionReport('development Electron', devReport)
  assertInteractionReport('installed app', installedReport)
  assertMatchingCaseCoverage(devReport, installedReport)

  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(REPORT_PATH, buildMarkdownReport(devReport, installedReport, files, appPath), 'utf8')

  console.log(
    [
      'control-interaction-ledger-smoke: ok',
      `devCases=${devReport.cases.length}`,
      `installedCases=${installedReport.cases.length}`,
      `controls=${installedReport.controlAudit.total}`,
      `report=${path.relative(repoRoot, REPORT_PATH)}`,
    ].join(' | ')
  )
}

async function collectElectronReport(repoRoot, files) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-interaction-ledger-dev-'))
  try {
    return await runInteractionProcess(electron, [repoRoot, ...files], {
      cwd: repoRoot,
      env: interactionEnv(files, stateDir),
      label: 'development Electron',
    })
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true })
  }
}

async function collectInstalledReport(appPath, files) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-interaction-ledger-installed-'))
  try {
    return await runInteractionProcess(appPath, files, {
      env: interactionEnv(files, stateDir),
      label: 'installed app',
    })
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true })
  }
}

function interactionEnv(files, stateDir) {
  return {
    ...process.env,
    ERG_VIEWER_QA_ACTIVE_STEP: 'Intake',
    ERG_VIEWER_QA_INTERACTIONS: '1',
    ERG_VIEWER_QA_STATE_DIR: stateDir,
    ERG_VIEWER_QA_EXPECTED_SOURCES: String(files.length),
    ERG_VIEWER_QA_SELECT_MODE: 'ERG',
  }
}

function runInteractionProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    let settled = false
    const child = spawn(command, args, {
      cwd: options.cwd || undefined,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      reject(new Error(`${options.label} interaction ledger timed out\n${stdout}\n${stderr}`))
    }, 70000)
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
      else if (code === 0) reject(new Error(`${options.label} exited without an interaction report\n${stdout}\n${stderr}`))
      else reject(new Error(`${options.label} exited with ${code}\n${stdout}\n${stderr}`))
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

function assertInteractionReport(label, report) {
  assert(report && report.status === 'ok', `${label} interaction status is ${report && report.status}`)
  assert(Array.isArray(report.cases) && report.cases.length >= 26, `${label} expected at least 26 cases`)
  assert(!report.cases.some((row) => !row.pass), `${label} contains failed cases`)
  assert(report.layout && Array.isArray(report.layout.issues) && report.layout.issues.length === 0, `${label} layout issues`)
  assert(report.controlAudit && report.controlAudit.status === 'ok', `${label} control audit failed`)
  assert(Array.isArray(report.controlAudit.issues) && report.controlAudit.issues.length === 0, `${label} control audit issues`)
}

function assertMatchingCaseCoverage(devReport, installedReport) {
  const devCases = new Set(devReport.cases.map((row) => row.name))
  const installedCases = new Set(installedReport.cases.map((row) => row.name))
  const missingInstalled = [...devCases].filter((name) => !installedCases.has(name))
  const missingDev = [...installedCases].filter((name) => !devCases.has(name))
  assert(!missingInstalled.length, `Installed app missing cases: ${missingInstalled.join(', ')}`)
  assert(!missingDev.length, `Development Electron missing cases: ${missingDev.join(', ')}`)
}

function buildMarkdownReport(devReport, installedReport, files, appPath) {
  const installedByName = new Map(installedReport.cases.map((row) => [row.name, row]))
  const lines = [
    '# Round 65 - Control Interaction Ledger',
    '',
    'Date: 2026-06-28',
    '',
    'This non-screenshot ledger records expected state, pre-click state, actual state, and a second verification for each automated control interaction. The first verification uses development Electron; the second verification repeats the same case in the installed macOS app.',
    '',
    '## Inputs',
    '',
    `- Representative batch: ${files.length} files`,
    `- Installed executable: ${appPath}`,
    '- Screenshot and Computer Use review: paused',
    '',
    '## Summary',
    '',
    `- Development cases: ${devReport.cases.length}`,
    `- Installed cases: ${installedReport.cases.length}`,
    `- Installed controls audited: ${installedReport.controlAudit.total}`,
    `- Installed controls covered: ${installedReport.controlAudit.covered}`,
    `- Installed controls reserved: ${installedReport.controlAudit.reserved}`,
    `- Installed disabled controls: ${installedReport.controlAudit.disabled}`,
    `- Post-interaction layout issues: ${installedReport.layout.issues.length}`,
    '',
    '## Ledger',
    '',
    '| Case | Expected | Dev Before | Dev Actual | Dev | Installed Actual | Second Verification |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ]

  devReport.cases.forEach((devCase) => {
    const installedCase = installedByName.get(devCase.name)
    lines.push(
      [
        devCase.name,
        compact(devCase.expected),
        compact(devCase.before),
        compact(devCase.actual),
        devCase.pass ? 'Pass' : 'Fail',
        compact(installedCase && installedCase.actual),
        installedCase && installedCase.pass ? 'Pass' : 'Fail',
      ]
        .map(tableCell)
        .join(' | ')
        .replace(/^/, '| ')
        .concat(' |')
    )
  })

  lines.push(
    '',
    '## Verdict',
    '',
    'All recorded control interactions passed in development Electron and passed again in the installed app. Native file dialogs and OS write actions remain explicitly reserved for the export/project roundtrip smoke tests while screenshot workflows are paused.',
    '',
    '## Remaining Gap',
    '',
    'This ledger is a state-based interaction audit for local QA; screenshot review can be run separately when needed.'
  )
  return `${lines.join('\n')}\n`
}

function compact(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function tableCell(value) {
  return String(value || '')
    .replace(/\|/g, '/')
    .replace(/\r?\n/g, ' ')
    .slice(0, 260)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error))
  process.exit(1)
})
