#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

function main() {
  const repoRoot = path.join(__dirname, '..')
  const protocolPath = path.join(repoRoot, 'docs', 'VISUAL_REVIEW_RESUME_PROTOCOL.md')
  assert(fs.existsSync(protocolPath), 'Visual review protocol is missing')
  const text = fs.readFileSync(protocolPath, 'utf8')

  ;[
    'Status: paused',
    'Do not run this protocol while the desktop may be locked.',
    'Round A - Installed App Baseline',
    'Round B - Control Interaction and Manual Correction',
    'Round C - Project Reopen and Release Artifact',
    'Graduate student',
    'Professor',
    'Product manager',
    'UI designer',
    'docs/examples/demo-control-1_FERG.xlsx',
    'docs/examples/demo-cko-1_FERG.xlsx',
    'docs/examples/demo-control-1_FVEP.xlsx',
    'docs/examples/demo-cko-1_FVEP.xlsx',
    '01-startup.png',
    '02-intake-imported.png',
    '03-review-erg.png',
    '05-analysis-erg.png',
    '07-report-erg.png',
    '04-review-manual-pick-nudged.png',
    '03-reopened-analysis.png',
    'npm run release:verify:mac',
    'npm run smoke:delivery-readiness',
    'visualReview=paused',
  ].forEach((fragment) => assert(text.includes(fragment), `Visual review protocol missing: ${fragment}`))

  const rounds = (text.match(/^### Round /gm) || []).length
  assert(rounds >= 3, `Expected at least 3 visual review rounds, got ${rounds}`)

  const screenshotNames = (text.match(/`[0-9]{2}-[^`]+\.png`/g) || []).length
  assert(screenshotNames >= 20, `Expected at least 20 named screenshots, got ${screenshotNames}`)

  console.log(
    ['visual-review-protocol-smoke: ok', `rounds=${rounds}`, `screenshots=${screenshotNames}`, 'status=paused'].join(
      ' | '
    )
  )
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
