#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const REPORT_DIR = path.join(
  __dirname,
  '..',
  'docs',
  'qa',
  '2026-06-28-global-redesign-round-68-visual-review-preflight'
)
const REPORT_PATH = path.join(REPORT_DIR, 'VISUAL_REVIEW_PREFLIGHT.md')

const REQUIRED_INPUTS = [
  'docs/examples/demo-control-1_FERG.xlsx',
  'docs/examples/demo-cko-1_FERG.xlsx',
  'docs/examples/demo-control-1_FVEP.xlsx',
  'docs/examples/demo-cko-1_FVEP.xlsx',
]

const REQUIRED_SCRIPTS = [
  'release:verify:mac',
  'smoke:delivery-readiness',
  'smoke:installed-input-mode-matrix',
  'smoke:installed-app-ui',
  'smoke:installed-control-response-matrix',
  'smoke:installed-ui-spec-matrix',
  'smoke:electron-quit',
]

const REQUIRED_ROLES = ['Graduate student', 'Professor', 'Product manager', 'UI designer']

const REQUIRED_ROUNDS = [
  {
    id: 'A',
    title: 'Round A - Installed App Baseline',
    screenshots: [
      '01-startup.png',
      '02-intake-imported.png',
      '03-review-erg.png',
      '04-review-fvep.png',
      '05-analysis-erg.png',
      '06-analysis-fvep.png',
      '07-report-erg.png',
      '08-report-fvep.png',
    ],
  },
  {
    id: 'B',
    title: 'Round B - Control Interaction and Manual Correction',
    screenshots: [
      '01-intake-cohort-edited.png',
      '02-review-included-toggle.png',
      '03-review-manual-pick-armed.png',
      '04-review-manual-pick-nudged.png',
      '05-analysis-erg-dops-manual.png',
      '06-analysis-fvep-latency.png',
      '07-report-scope-erg.png',
      '08-report-scope-fvep.png',
    ],
  },
  {
    id: 'C',
    title: 'Round C - Project Reopen and Release Artifact',
    screenshots: [
      '01-open-project-dialog.png',
      '02-reopened-review.png',
      '03-reopened-analysis.png',
      '04-reopened-report.png',
      '05-exported-workbook-ready.png',
      '06-exported-pdf-ready.png',
      '07-quit-entry.png',
    ],
  },
]

function main() {
  const repoRoot = path.join(__dirname, '..')
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const scripts = packageJson.scripts || {}
  const protocolPath = path.join(repoRoot, 'docs', 'VISUAL_REVIEW_RESUME_PROTOCOL.md')
  const auditPath = path.join(repoRoot, 'docs', 'DELIVERY_READINESS_AUDIT.md')
  const installedApp = '/Applications/ERG Viewer.app'
  const installedExecutable = path.join(installedApp, 'Contents', 'MacOS', 'ERG Viewer')

  assertFile(protocolPath)
  assertFile(auditPath)
  assertFile(installedExecutable)

  const protocolText = fs.readFileSync(protocolPath, 'utf8')
  const auditText = fs.readFileSync(auditPath, 'utf8')

  assert(protocolText.includes('Status: paused'), 'Visual review protocol must still be paused')
  assert(
    protocolText.includes('Do not run this protocol while the desktop may be locked.'),
    'Visual review protocol must preserve locked-desktop guard'
  )
  assert(
    auditText.includes('visualReview=paused') || auditText.includes('Three rounds of screenshot/Computer Use visual review') && auditText.includes('Paused'),
    'Delivery audit must preserve paused screenshot/Computer Use status'
  )
  assert(
    auditText.includes('Do not mark final delivery complete'),
    'Delivery audit must preserve final-delivery completion guard'
  )

  REQUIRED_INPUTS.forEach((relativePath) => assertFile(path.join(repoRoot, relativePath)))
  REQUIRED_SCRIPTS.forEach((name) => assert(scripts[name], `package.json missing script ${name}`))
  REQUIRED_ROLES.forEach((role) => assert(protocolText.includes(role), `Protocol missing role ${role}`))

  const screenshots = []
  REQUIRED_ROUNDS.forEach((round) => {
    assert(protocolText.includes(round.title), `Protocol missing ${round.title}`)
    round.screenshots.forEach((name) => {
      assert(protocolText.includes(name), `Protocol missing screenshot ${name}`)
      screenshots.push(name)
    })
  })
  assert(new Set(screenshots).size === screenshots.length, 'Required screenshot names must be unique')
  assert(screenshots.length === 23, `Expected 23 required screenshots, got ${screenshots.length}`)

  ;[
    'Expected state before click is written down.',
    'Actual state after click is written down.',
    'The same control is checked again after the fix if a defect is found.',
    'defect list with expected state, actual state, fix, and second verification',
  ].forEach((fragment) => assert(protocolText.includes(fragment), `Protocol missing interaction audit fragment: ${fragment}`))

  const installedVersion = defaultsRead(path.join(installedApp, 'Contents', 'Info'), 'CFBundleShortVersionString')
  const installedBundleId = defaultsRead(path.join(installedApp, 'Contents', 'Info'), 'CFBundleIdentifier')
  assert(installedVersion === packageJson.version, `Installed version ${installedVersion} != ${packageJson.version}`)
  assert(installedBundleId === packageJson.build.appId, `Installed bundle id ${installedBundleId} != ${packageJson.build.appId}`)

  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(
    REPORT_PATH,
    buildReport({
      version: packageJson.version,
      bundleId: installedBundleId,
      installedExecutable,
      inputs: REQUIRED_INPUTS,
      scripts: REQUIRED_SCRIPTS,
      roles: REQUIRED_ROLES,
      rounds: REQUIRED_ROUNDS,
      screenshots,
    }),
    'utf8'
  )

  console.log(
    [
      'visual-review-preflight-smoke: ok',
      `rounds=${REQUIRED_ROUNDS.length}`,
      `screenshots=${screenshots.length}`,
      `inputs=${REQUIRED_INPUTS.length}`,
      `installed=${installedVersion}`,
      `report=${path.relative(repoRoot, REPORT_PATH)}`,
      'status=paused',
    ].join(' | ')
  )
}

function buildReport(context) {
  const lines = [
    '# Round 68 - Visual Review Preflight',
    '',
    'Date: 2026-06-28',
    '',
    'This preflight does not run Computer Use and does not capture screenshots. It verifies that the paused three-round visual review can be resumed with concrete inputs, scripts, installed app metadata, role-review requirements, screenshot names, and expected/actual/second-verification rules already defined.',
    '',
    `Installed executable: ${context.installedExecutable}`,
    `Installed version: ${context.version}`,
    `Installed bundle id: ${context.bundleId}`,
    '',
    '## Inputs',
    '',
    ...context.inputs.map((item) => `- ${item}`),
    '',
    '## Required Scripts',
    '',
    ...context.scripts.map((item) => `- npm run ${item}`),
    '',
    '## Review Roles',
    '',
    ...context.roles.map((item) => `- ${item}`),
    '',
    '## Screenshot Rounds',
    '',
  ]
  context.rounds.forEach((round) => {
    lines.push(`### Round ${round.id}`, '', `- ${round.title}`, `- Required screenshots: ${round.screenshots.length}`)
    round.screenshots.forEach((name) => lines.push(`  - ${name}`))
    lines.push('')
  })
  lines.push(
    '## Verdict',
    '',
    `Preflight passed for ${context.rounds.length} rounds and ${context.screenshots.length} named screenshots. Final delivery remains paused until screenshot and Computer Use workflows are explicitly resumed and completed.`
  )
  return `${lines.join('\n')}\n`
}

function defaultsRead(infoPath, key) {
  const result = spawnSync('defaults', ['read', infoPath, key], { encoding: 'utf8' })
  assert(result.status === 0, `defaults read failed for ${key}: ${result.stderr || result.stdout}`)
  return String(result.stdout || '').trim()
}

function assertFile(filePath) {
  assert(fs.existsSync(filePath), `Expected file to exist: ${filePath}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
