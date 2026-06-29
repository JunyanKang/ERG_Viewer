#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const PACKET_PATH = path.join(__dirname, '..', 'docs', 'VISUAL_REVIEW_EXECUTION_PACKET.md')
const PROTOCOL_PATH = path.join(__dirname, '..', 'docs', 'VISUAL_REVIEW_RESUME_PROTOCOL.md')

const REQUIRED_FIELDS = [
  'Screenshot',
  'Page',
  'Control or region',
  'Expected',
  'Actual',
  'Severity',
  'Root cause',
  'Fix',
  'Second verification',
  'Role impact',
]

const REQUIRED_ROLES = ['Graduate Student', 'Professor', 'Product Manager', 'UI Designer']

const REQUIRED_SCREENSHOTS = [
  '01-startup.png',
  '02-intake-imported.png',
  '03-review-erg.png',
  '04-review-fvep.png',
  '05-analysis-erg.png',
  '06-analysis-fvep.png',
  '07-report-erg.png',
  '08-report-fvep.png',
  '01-intake-cohort-edited.png',
  '02-review-included-toggle.png',
  '03-review-manual-pick-armed.png',
  '04-review-manual-pick-nudged.png',
  '05-analysis-erg-dops-manual.png',
  '06-analysis-fvep-latency.png',
  '07-report-scope-erg.png',
  '08-report-scope-fvep.png',
  '01-open-project-dialog.png',
  '02-reopened-review.png',
  '03-reopened-analysis.png',
  '04-reopened-report.png',
  '05-exported-workbook-ready.png',
  '06-exported-pdf-ready.png',
  '07-quit-entry.png',
]

const REQUIRED_ROUNDS = [
  'Round A - Installed App Baseline',
  'Round B - Control Interaction and Manual Correction',
  'Round C - Project Reopen and Release Artifact',
]

function main() {
  assertFile(PACKET_PATH)
  assertFile(PROTOCOL_PATH)
  const packet = fs.readFileSync(PACKET_PATH, 'utf8')
  const protocol = fs.readFileSync(PROTOCOL_PATH, 'utf8')

  assert(packet.includes('Status: prepared'), 'Execution packet must be prepared, not completed')
  assert(packet.includes('does not capture screenshots'), 'Execution packet must not claim screenshot evidence')
  assert(packet.includes('Final delivery still requires actual Computer Use'), 'Execution packet must preserve final-delivery caveat')
  assert(protocol.includes('Do not run this protocol while the desktop may be locked.'), 'Protocol must preserve locked-desktop guard')

  REQUIRED_FIELDS.forEach((field) => assert(packet.includes(`| ${field} |`), `Defect schema missing field ${field}`))
  REQUIRED_ROLES.forEach((role) => assert(packet.includes(`### ${role}`), `Execution packet missing role ${role}`))
  REQUIRED_ROUNDS.forEach((round) => assert(packet.includes(`## ${round}`), `Execution packet missing ${round}`))
  REQUIRED_SCREENSHOTS.forEach((name) => assert(packet.includes(`\`${name}\``), `Execution packet missing screenshot ${name}`))

  const screenshotMatches = packet.match(/`[0-9]{2}-[^`]+\.png`/g) || []
  const screenshotNames = screenshotMatches.map((item) => item.slice(1, -1))
  const requiredSet = new Set(REQUIRED_SCREENSHOTS)
  const documentedRequired = screenshotNames.filter((name) => requiredSet.has(name))
  assert(new Set(documentedRequired).size === REQUIRED_SCREENSHOTS.length, 'Execution packet screenshot names are incomplete')

  ;[
    'Expected/actual state',
    'second verification screenshot',
    'No blocker or major defect remains open.',
    'npm run release:verify:mac',
    'npm run smoke:delivery-readiness',
    'visualReview=paused',
  ].forEach((fragment) => assert(packet.includes(fragment), `Execution packet missing completion fragment: ${fragment}`))

  console.log(
    [
      'visual-review-execution-packet-smoke: ok',
      `rounds=${REQUIRED_ROUNDS.length}`,
      `screenshots=${REQUIRED_SCREENSHOTS.length}`,
      `roles=${REQUIRED_ROLES.length}`,
      `defectFields=${REQUIRED_FIELDS.length}`,
      'status=prepared',
    ].join(' | ')
  )
}

function assertFile(filePath) {
  assert(fs.existsSync(filePath), `Expected file to exist: ${filePath}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
