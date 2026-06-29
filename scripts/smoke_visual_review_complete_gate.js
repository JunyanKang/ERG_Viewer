#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const repoRoot = path.join(__dirname, '..')
const reportPath = path.join(
  repoRoot,
  'docs',
  'qa',
  '2026-06-28-global-redesign-round-71-visual-review-completion-audit',
  'VISUAL_REVIEW_COMPLETION_AUDIT.md'
)

function main() {
  const result = spawnSync('npm', ['run', 'audit:visual-review-completion:complete'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  })
  const output = stripAnsi(`${result.stdout || ''}\n${result.stderr || ''}`)

  assert(result.status !== 0, 'Strict visual review completion gate unexpectedly passed while evidence is paused.')
  ;[
    'Visual review is not complete',
    'Missing screenshots: 23',
    'Round pass/fail not complete',
    'Role review is incomplete',
    'Artifact evidence is incomplete',
    'Expected/actual ledger is incomplete',
    'Delivery readiness audit has not been switched to completed visual evidence',
  ].forEach((fragment) => assert(output.includes(fragment), `Strict completion output missing fragment: ${fragment}`))

  assert(fs.existsSync(reportPath), `Expected completion audit report to exist: ${reportPath}`)
  const report = fs.readFileSync(reportPath, 'utf8')
  ;[
    'Status: paused',
    'Required screenshots present: 0/23',
    'Visual review evidence is not complete. Keep final delivery paused.',
  ].forEach((fragment) => assert(report.includes(fragment), `Completion audit report missing fragment: ${fragment}`))

  console.log('visual-review-complete-gate-smoke: ok | expectedFailure=true | screenshots=0/23 | mode=require-complete')
}

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
