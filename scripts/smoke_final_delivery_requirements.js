#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const REPORT_PATH = path.join(
  __dirname,
  '..',
  'docs',
  'qa',
  '2026-06-28-global-redesign-round-64-final-delivery-requirements',
  'FINAL_DELIVERY_REQUIREMENTS.md'
)

const REQUIREMENTS = [
  {
    id: 'real-file-import',
    requirement: 'Import real ERG/FVEP Excel files, including single-file and multi-file batches.',
    evidence: [
      'npm run smoke:v2',
      'npm run smoke:electron-state',
      'npm run smoke:installed-input-mode-matrix',
      'npm run smoke:installed-app-roundtrip',
    ],
    status: 'Passed',
  },
  {
    id: 'project-save-reopen',
    requirement: 'Save and reopen project files to reproduce analysis state.',
    evidence: ['npm run smoke:electron-project-roundtrip', 'npm run smoke:installed-app-roundtrip'],
    status: 'Passed',
  },
  {
    id: 'manual-correction',
    requirement: 'Manual correction changes corrected metrics and persists through project reproducibility.',
    evidence: ['npm run smoke:project-repro', 'npm run smoke:electron-interactions'],
    status: 'Passed',
  },
  {
    id: 'scientific-analysis',
    requirement: 'Provide ERG/FVEP publication-oriented analysis and report outputs.',
    evidence: ['npm run smoke:scientific-output', 'npm run smoke:electron-role-review'],
    status: 'Passed',
  },
  {
    id: 'controls-and-flow',
    requirement: 'Test different pages and controls through workflow and error-checking paths.',
    evidence: [
      'npm run smoke:electron-interactions',
      'npm run smoke:installed-app-ui',
      'npm run smoke:installed-control-response-matrix',
    ],
    status: 'Passed',
  },
  {
    id: 'role-review',
    requirement: 'Review from graduate student, professor, product manager, and UI designer perspectives.',
    evidence: ['npm run smoke:electron-role-review'],
    status: 'Passed',
  },
  {
    id: 'layout-typography',
    requirement: 'Check labels, spacing, alignment, clipping, control density, typography, and color scale.',
    evidence: [
      'npm run smoke:electron-layout',
      'npm run smoke:electron-design-audit',
      'npm run smoke:visual-design-matrix',
      'npm run smoke:installed-visual-design-matrix',
      'npm run smoke:installed-ui-spec-matrix',
    ],
    status: 'Passed',
  },
  {
    id: 'release-package',
    requirement: 'Build, install, and verify the macOS release package.',
    evidence: ['npm run release:verify:mac', 'npm run smoke:mac-release-artifacts'],
    status: 'Passed',
  },
  {
    id: 'screenshots-computer-use',
    requirement: 'Use Computer Use and screenshots at every launch/data-analysis step for at least three rounds.',
    evidence: [
      'docs/VISUAL_REVIEW_RESUME_PROTOCOL.md',
      'npm run smoke:visual-review-preflight',
      'npm run smoke:visual-review-execution-packet',
      'npm run prepare:visual-review-workspace -- --check',
      'npm run audit:visual-review-completion',
      'future: npm run audit:visual-review-completion:complete',
    ],
    status: 'Paused',
  },
  {
    id: 'developer-id',
    requirement: 'Developer ID signing and notarization for public macOS distribution.',
    evidence: ['npm run smoke:mac-release-artifacts reports adhoc signing'],
    status: 'Not available',
  },
]

function main() {
  const repoRoot = path.join(__dirname, '..')
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const auditPath = path.join(repoRoot, 'docs', 'DELIVERY_READINESS_AUDIT.md')
  const visualProtocolPath = path.join(repoRoot, 'docs', 'VISUAL_REVIEW_RESUME_PROTOCOL.md')
  assertFile(auditPath)
  assertFile(visualProtocolPath)

  const auditText = fs.readFileSync(auditPath, 'utf8')
  const protocolText = fs.readFileSync(visualProtocolPath, 'utf8')
  assert(
    /macos-release-verify: ok \| steps=\d+/.test(auditText),
    'Delivery audit missing a recorded non-screenshot release verification'
  )
  assert(auditText.includes('visualReview=paused') || auditText.includes('visual review |'), 'Delivery audit must preserve paused visual review status')
  assert(protocolText.includes('Status: paused'), 'Visual review protocol must remain paused until screenshots are allowed')
  assert(protocolText.includes('Round A - Installed App Baseline'), 'Visual protocol missing Round A')
  assert(protocolText.includes('Round B - Control Interaction and Manual Correction'), 'Visual protocol missing Round B')
  assert(protocolText.includes('Round C - Project Reopen and Release Artifact'), 'Visual protocol missing Round C')
  assert(protocolText.includes('npm run smoke:visual-review-preflight'), 'Visual protocol missing preflight command')
  assert(protocolText.includes('npm run smoke:visual-review-execution-packet'), 'Visual protocol missing execution packet command')
  assert(protocolText.includes('npm run prepare:visual-review-workspace'), 'Visual protocol missing workspace command')
  assertFile(path.join(repoRoot, 'docs', 'VISUAL_REVIEW_EXECUTION_PACKET.md'))
  assertFile(path.join(repoRoot, 'docs', 'qa', '2026-06-28-final-visual-review-resumed', 'README.md'))
  assertFile(
    path.join(
      repoRoot,
      'docs',
      'qa',
      '2026-06-28-global-redesign-round-71-visual-review-completion-audit',
      'VISUAL_REVIEW_COMPLETION_AUDIT.md'
    )
  )

  const installedVersion = defaultsRead('/Applications/ERG Viewer.app/Contents/Info', 'CFBundleShortVersionString')
  const installedBundleId = defaultsRead('/Applications/ERG Viewer.app/Contents/Info', 'CFBundleIdentifier')
  assert(installedVersion === packageJson.version, `Installed version ${installedVersion} != ${packageJson.version}`)
  assert(installedBundleId === packageJson.build.appId, `Installed bundle id ${installedBundleId} != ${packageJson.build.appId}`)

  const report = buildReport(packageJson.version, installedBundleId)
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, report, 'utf8')

  const passed = REQUIREMENTS.filter((item) => item.status === 'Passed').length
  const paused = REQUIREMENTS.filter((item) => item.status === 'Paused').length
  const unavailable = REQUIREMENTS.filter((item) => item.status === 'Not available').length
  assert(paused === 1, 'Exactly one final-delivery requirement should remain paused')
  console.log(
    [
      'final-delivery-requirements-smoke: ok',
      `passed=${passed}`,
      `paused=${paused}`,
      `notAvailable=${unavailable}`,
      `report=${path.relative(repoRoot, REPORT_PATH)}`,
    ].join(' | ')
  )
}

function buildReport(version, bundleId) {
  const lines = [
    '# Round 64 - Final Delivery Requirements Audit',
    '',
    'Date: 2026-06-28',
    '',
    `Installed version: ${version}`,
    `Installed bundle id: ${bundleId}`,
    '',
    'This machine-readable audit maps the original delivery objective to current evidence. It intentionally does not mark final delivery complete while screenshot and Computer Use review remains paused.',
    '',
    '| ID | Requirement | Evidence | Status |',
    '| --- | --- | --- | --- |',
  ]
  REQUIREMENTS.forEach((item) => {
    lines.push(`| ${item.id} | ${item.requirement} | ${item.evidence.join('<br>')} | ${item.status} |`)
  })
  lines.push(
    '',
    '## Completion Rule',
    '',
    'Final delivery can only be marked complete after the paused screenshot/Computer Use requirement is explicitly resumed and completed, or the user explicitly replaces that requirement with the deterministic non-screenshot evidence chain.',
    '',
    '## Current Verdict',
    '',
    'Do not mark final delivery complete.'
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
