#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const DEFAULT_APP = '/Applications/ERG Viewer.app/Contents/MacOS/ERG Viewer'
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
  '2026-06-28-global-redesign-round-74-installed-control-response-matrix'
)
const REPORT_PATH = path.join(REPORT_DIR, 'INSTALLED_CONTROL_RESPONSE_MATRIX.md')

const REQUIRED_CASES = [
  'topbar-review-tab',
  'topbar-workflow-tab-cycle',
  'topbar-quit-entry-visible',
  'intake-source-select',
  'intake-category-switch',
  'intake-record-select',
  'analysis-include-toggle',
  'analysis-data-matrix-shape',
  'intake-cohort-name-edit',
  'intake-cohort-group-edit',
  'intake-cohort-apply',
  'intake-pair-issue-review',
  'review-scope-selects',
  'review-plot-range-controls',
  'review-manual-pick-arm-and-done',
  'inspector-metadata-inputs',
  'analysis-metric-select',
  'analysis-source-links-metric',
  'analysis-mode-layer-selects',
  'analysis-copy-csv-enabled',
  'report-scope-erg',
  'report-scope-fvep',
  'report-scope-appendix',
  'report-action-buttons-enabled',
  'source-file-remove-button',
]

const CATEGORIES = [
  ['Topbar and app lifecycle', /^topbar-/],
  ['Intake acquisition, cohort, and study design', /^intake-/],
  ['Review manual correction', /^(review|inspector)-/],
  ['Analysis plotting and grouping', /^analysis-/],
  ['Report output controls', /^report-/],
  ['Source file management', /^source-/],
]

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

  const report = await collectInstalledInteractionReport(appPath, files)
  assertInstalledReport(report)

  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(REPORT_PATH, buildMarkdownReport(report, files, appPath, repoRoot), 'utf8')

  const categoryCounts = categorizeCases(report.cases)
  console.log(
    [
      'installed-control-response-matrix-smoke: ok',
      `cases=${report.cases.length}`,
      `controls=${report.controlAudit.total}`,
      `covered=${report.controlAudit.covered}`,
      `reserved=${report.controlAudit.reserved}`,
      `categories=${categoryCounts.length}`,
      `report=${path.relative(repoRoot, REPORT_PATH)}`,
    ].join(' | ')
  )
}

async function collectInstalledInteractionReport(appPath, files) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-installed-control-matrix-'))
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
      reject(new Error(`Installed control matrix timed out\n${stdout}\n${stderr}`))
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
      else if (code === 0) reject(new Error(`Installed app exited without a control matrix report\n${stdout}\n${stderr}`))
      else reject(new Error(`Installed app exited with ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function assertInstalledReport(report) {
  assert(report && report.status === 'ok', `Installed interaction status is ${report && report.status}`)
  assert(Array.isArray(report.cases) && report.cases.length >= REQUIRED_CASES.length, 'Installed cases missing')
  const caseNames = new Set(report.cases.map((row) => row.name))
  const missing = REQUIRED_CASES.filter((name) => !caseNames.has(name))
  assert(!missing.length, `Installed control matrix missing cases: ${missing.join(', ')}`)
  assert(!report.cases.some((row) => !row.pass), 'Installed control matrix contains failed cases')
  assert(report.layout && Array.isArray(report.layout.issues) && report.layout.issues.length === 0, 'Post-click layout issues remain')
  assert(report.controlAudit && report.controlAudit.status === 'ok', 'Control coverage audit failed')
  assert(Array.isArray(report.controlAudit.issues) && report.controlAudit.issues.length === 0, 'Control coverage issues remain')
  assert(report.controlAudit.total >= 84, `Too few controls audited: ${report.controlAudit.total}`)
  assert(report.controlAudit.covered >= 64, `Too few controls covered: ${report.controlAudit.covered}`)
  assert(report.controlAudit.disabled <= 5, `Unexpected disabled control count: ${report.controlAudit.disabled}`)
  CATEGORIES.forEach(([label, pattern]) => {
    assert(report.cases.some((row) => pattern.test(row.name)), `Missing category coverage: ${label}`)
  })
}

function buildMarkdownReport(report, files, appPath, repoRoot) {
  const categoryCounts = categorizeCases(report.cases)
  const lines = [
    '# Round 74 - Installed Control Response Matrix',
    '',
    'Date: 2026-06-28',
    '',
    'This non-screenshot matrix verifies the installed macOS app by launching `/Applications/ERG Viewer.app`, importing a representative mixed ERG/FVEP batch, clicking the instrumented controls, and recording expected versus actual state after each click. It complements, but does not replace, the paused Computer Use screenshot review.',
    '',
    '## Inputs',
    '',
    `- Installed executable: ${appPath}`,
    `- Representative files: ${files.length}`,
    ...files.map((filePath) => `  - ${path.relative(repoRoot, filePath)}`),
    '',
    '## Acceptance Gates',
    '',
    `- Required interaction cases: ${REQUIRED_CASES.length}/${REQUIRED_CASES.length}`,
    `- Installed interaction cases observed: ${report.cases.length}`,
    `- Controls audited: ${report.controlAudit.total}`,
    `- Controls covered by click/typing/select or reserved external smoke: ${report.controlAudit.covered + report.controlAudit.reserved}`,
    `- Disabled controls: ${report.controlAudit.disabled}`,
    `- Post-click layout issues: ${report.layout.issues.length}`,
    '',
    '## Category Coverage',
    '',
    '| Category | Cases | Result |',
    '| --- | ---: | --- |',
  ]

  categoryCounts.forEach((row) => {
    lines.push(`| ${row.label} | ${row.count} | ${row.count > 0 ? 'Pass' : 'Fail'} |`)
  })

  lines.push('', '## Response Matrix', '', '| Case | Expected before click | Actual after click | Result |', '| --- | --- | --- | --- |')
  report.cases.forEach((row) => {
    lines.push(`| ${cell(row.name)} | ${cell(row.expected)} | ${cell(row.actual)} | ${row.pass ? 'Pass' : 'Fail'} |`)
  })

  lines.push(
    '',
    '## Verdict',
    '',
    'Passed. The installed application responds to the automated cross-page control matrix with no failed cases and no post-click layout issues.',
    '',
    '## Remaining Gap',
    '',
    'This is a state-based installed-app verification for local QA; screenshot review can be run separately when needed.'
  )
  return `${lines.join('\n')}\n`
}

function categorizeCases(cases) {
  return CATEGORIES.map(([label, pattern]) => ({
    label,
    count: cases.filter((row) => pattern.test(row.name)).length,
  }))
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

function cell(value) {
  return compact(value).replace(/\|/g, '/').replace(/\r?\n/g, ' ').slice(0, 260)
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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error))
  process.exit(1)
})
