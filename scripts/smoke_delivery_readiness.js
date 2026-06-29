#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const REQUIRED_SCRIPTS = [
  'check',
  'smoke:v2',
  'smoke:scientific-output',
  'smoke:project-repro',
  'smoke:electron-state',
  'smoke:electron-export',
  'smoke:electron-layout',
  'smoke:electron-design-audit',
  'smoke:electron-interactions',
  'smoke:control-interaction-ledger',
  'smoke:electron-role-review',
  'smoke:electron-project-roundtrip',
  'smoke:installed-app-roundtrip',
  'smoke:installed-app-ui',
  'smoke:installed-visual-design-matrix',
  'smoke:installed-input-mode-matrix',
  'smoke:installed-control-response-matrix',
  'smoke:installed-ui-spec-matrix',
  'smoke:mac-release-artifacts',
  'smoke:electron-quit',
  'smoke:final-delivery-requirements',
  'smoke:visual-review-protocol',
  'smoke:visual-review-preflight',
  'smoke:visual-review-execution-packet',
  'prepare:visual-review-workspace',
  'audit:visual-review-completion',
  'audit:visual-review-completion:complete',
  'smoke:visual-review-complete-gate',
  'smoke:visual-design-matrix',
  'release:verify:mac',
]

const REQUIRED_QA_NOTES = [
  'docs/qa/2026-06-28-global-redesign-round-53-control-response-coverage/ROUND53_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-54-role-review-stage-logic/ROUND54_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-55-project-roundtrip/ROUND55_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-56-installed-app-roundtrip/ROUND56_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-57-installed-app-ui-release-gate/ROUND57_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-58-macos-release-artifacts/ROUND58_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-59-one-command-macos-release-verification/ROUND59_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-60-delivery-readiness-audit/ROUND60_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-61-quit-entry-hardening/ROUND61_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-62-visual-design-matrix/ROUND62_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-62-visual-design-matrix/VISUAL_DESIGN_MATRIX.md',
  'docs/qa/2026-06-28-global-redesign-round-63-installed-visual-design-matrix/ROUND63_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-63-installed-visual-design-matrix/INSTALLED_VISUAL_DESIGN_MATRIX.md',
  'docs/qa/2026-06-28-global-redesign-round-64-final-delivery-requirements/ROUND64_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-64-final-delivery-requirements/FINAL_DELIVERY_REQUIREMENTS.md',
  'docs/qa/2026-06-28-global-redesign-round-65-control-interaction-ledger/ROUND65_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-65-control-interaction-ledger/CONTROL_INTERACTION_LEDGER.md',
  'docs/qa/2026-06-28-global-redesign-round-66-installed-input-mode-matrix/ROUND66_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-66-installed-input-mode-matrix/INSTALLED_INPUT_MODE_MATRIX.md',
  'docs/qa/2026-06-28-global-redesign-round-68-visual-review-preflight/ROUND68_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-68-visual-review-preflight/VISUAL_REVIEW_PREFLIGHT.md',
  'docs/VISUAL_REVIEW_EXECUTION_PACKET.md',
  'docs/qa/2026-06-28-global-redesign-round-69-visual-review-execution-packet/ROUND69_NOTES.md',
  'docs/qa/2026-06-28-final-visual-review-resumed/README.md',
  'docs/qa/2026-06-28-final-visual-review-resumed/ROUND_A_NOTES.md',
  'docs/qa/2026-06-28-final-visual-review-resumed/ROUND_B_NOTES.md',
  'docs/qa/2026-06-28-final-visual-review-resumed/ROUND_C_NOTES.md',
  'docs/qa/2026-06-28-final-visual-review-resumed/DEFECT_LOG.tsv',
  'docs/qa/2026-06-28-final-visual-review-resumed/EXPECTED_ACTUAL_LEDGER.tsv',
  'docs/qa/2026-06-28-final-visual-review-resumed/ROLE_REVIEW.md',
  'docs/qa/2026-06-28-final-visual-review-resumed/ARTIFACTS.md',
  'docs/qa/2026-06-28-global-redesign-round-70-visual-review-workspace/ROUND70_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-71-visual-review-completion-audit/VISUAL_REVIEW_COMPLETION_AUDIT.md',
  'docs/qa/2026-06-28-global-redesign-round-71-visual-review-completion-audit/ROUND71_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-72-visual-review-complete-gate/ROUND72_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-73-visual-review-complete-gate-negative/ROUND73_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-74-installed-control-response-matrix/ROUND74_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-74-installed-control-response-matrix/INSTALLED_CONTROL_RESPONSE_MATRIX.md',
  'docs/qa/2026-06-28-global-redesign-round-75-installed-ui-spec-matrix/ROUND75_NOTES.md',
  'docs/qa/2026-06-28-global-redesign-round-75-installed-ui-spec-matrix/INSTALLED_UI_SPEC_MATRIX.md',
  'docs/qa/2026-06-28-global-redesign-round-76-release-verify-order-refresh/ROUND76_NOTES.md',
]

function main() {
  const repoRoot = path.join(__dirname, '..')
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const version = String(packageJson.version || '').trim()
  const scripts = packageJson.scripts || {}
  REQUIRED_SCRIPTS.forEach((name) => assert(scripts[name], `package.json missing script ${name}`))

  const auditPath = path.join(repoRoot, 'docs', 'DELIVERY_READINESS_AUDIT.md')
  assertFile(auditPath)
  const auditText = fs.readFileSync(auditPath, 'utf8')
  ;[
    'Full non-screenshot macOS delivery verification',
    'Three rounds of screenshot/Computer Use visual review',
    'Screenshot/Computer Use resume protocol',
    'Installed app full quit paths',
    'Non-screenshot visual design matrix',
    'Installed app visual design matrix',
    'Installed control response matrix',
    'Installed UI specification matrix',
    'Final delivery requirement audit',
    'Control interaction ledger',
    'Installed input mode matrix',
    'Paused',
    'Do not mark final delivery complete',
  ].forEach((fragment) => assert(auditText.includes(fragment), `Delivery audit missing fragment: ${fragment}`))

  const visualProtocolPath = path.join(repoRoot, 'docs', 'VISUAL_REVIEW_RESUME_PROTOCOL.md')
  assertFile(visualProtocolPath)
  const visualProtocol = fs.readFileSync(visualProtocolPath, 'utf8')
  ;[
    'Status: paused',
    'Round A - Installed App Baseline',
    'Round B - Control Interaction and Manual Correction',
    'Round C - Project Reopen and Release Artifact',
  ].forEach((fragment) => assert(visualProtocol.includes(fragment), `Visual review protocol missing fragment: ${fragment}`))

  REQUIRED_QA_NOTES.forEach((relativePath) => assertFile(path.join(repoRoot, relativePath)))

  const installedInfo = '/Applications/ERG Viewer.app/Contents/Info'
  const installedVersion = defaultsRead(installedInfo, 'CFBundleShortVersionString')
  const installedBundleId = defaultsRead(installedInfo, 'CFBundleIdentifier')
  assert(installedVersion === version, `Installed app version ${installedVersion} != package version ${version}`)
  assert(installedBundleId === packageJson.build.appId, `Installed bundle id ${installedBundleId} != ${packageJson.build.appId}`)

  ;[
    `dist/ERG Viewer-${version}-mac-${process.arch}.dmg`,
    `dist/ERG Viewer-${version}-mac-${process.arch}.zip`,
    `dist/ERG Viewer-${version}-mac-${process.arch}.dmg.blockmap`,
    `dist/ERG Viewer-${version}-mac-${process.arch}.zip.blockmap`,
  ].forEach((relativePath) => assertFile(path.join(repoRoot, relativePath)))

  console.log(
    [
      'delivery-readiness-smoke: ok',
      `version=${version}`,
      `scripts=${REQUIRED_SCRIPTS.length}`,
      `qaNotes=${REQUIRED_QA_NOTES.length}`,
      'visualReview=paused',
    ].join(' | ')
  )
}

function defaultsRead(infoPath, key) {
  const result = spawnSync('defaults', ['read', infoPath, key], { encoding: 'utf8' })
  assert(result.status === 0, `defaults read failed for ${infoPath} ${key}: ${result.stderr || result.stdout}`)
  return String(result.stdout || '').trim()
}

function assertFile(filePath) {
  assert(fs.existsSync(filePath), `Expected file to exist: ${filePath}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
