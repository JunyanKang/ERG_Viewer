#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const repoRoot = path.join(__dirname, '..')
const WORKSPACE_DIR = path.join(repoRoot, 'docs', 'qa', '2026-06-28-final-visual-review-resumed')
const AUDIT_PATH = path.join(repoRoot, 'docs', 'DELIVERY_READINESS_AUDIT.md')
const REPORT_DIR = path.join(
  repoRoot,
  'docs',
  'qa',
  '2026-06-28-global-redesign-round-71-visual-review-completion-audit'
)
const REPORT_PATH = path.join(REPORT_DIR, 'VISUAL_REVIEW_COMPLETION_AUDIT.md')

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

const ROUND_FILES = ['ROUND_A_NOTES.md', 'ROUND_B_NOTES.md', 'ROUND_C_NOTES.md']
const COMPLETED_STATUSES = new Set(['closed', 'verified', 'resolved', 'pass', 'passed'])

function main() {
  const requireComplete = process.argv.includes('--require-complete')
  const result = evaluate()
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(REPORT_PATH, buildReport(result), 'utf8')

  if (requireComplete) {
    assert(result.complete, `Visual review is not complete:\n${result.blockers.join('\n')}`)
  } else {
    assert(!result.complete, 'Visual review completion audit unexpectedly found completed evidence.')
    assert(result.paused, 'Visual review completion audit should remain paused unless --require-complete is used.')
  }

  console.log(
    [
      'visual-review-completion-audit: ok',
      `mode=${requireComplete ? 'require-complete' : 'expect-paused'}`,
      `complete=${result.complete}`,
      `paused=${result.paused}`,
      `screenshots=${result.presentScreenshots}/${REQUIRED_SCREENSHOTS.length}`,
      `openDefects=${result.openDefects}`,
      `report=${path.relative(repoRoot, REPORT_PATH)}`,
    ].join(' | ')
  )
}

function evaluate() {
  assertFile(WORKSPACE_DIR)
  assertFile(AUDIT_PATH)
  ROUND_FILES.forEach((fileName) => assertFile(path.join(WORKSPACE_DIR, fileName)))
  ;['DEFECT_LOG.tsv', 'EXPECTED_ACTUAL_LEDGER.tsv', 'ROLE_REVIEW.md', 'ARTIFACTS.md'].forEach((fileName) =>
    assertFile(path.join(WORKSPACE_DIR, fileName))
  )

  const auditText = fs.readFileSync(AUDIT_PATH, 'utf8')
  const missingScreenshots = REQUIRED_SCREENSHOTS.filter((name) => !fs.existsSync(path.join(WORKSPACE_DIR, name)))
  const presentScreenshots = REQUIRED_SCREENSHOTS.length - missingScreenshots.length
  const templateFiles = ['README.md', ...ROUND_FILES, 'ROLE_REVIEW.md', 'ARTIFACTS.md']
    .map((fileName) => [fileName, readWorkspace(fileName)])
    .filter(([, text]) => /Status:\s*template/i.test(text) || /\bpending\b/i.test(text))
    .map(([fileName]) => fileName)

  const roundFailures = ROUND_FILES.filter((fileName) => !/Pass\/Fail:\s*pass(ed)?\b/i.test(readWorkspace(fileName)))
  const roleReviewText = readWorkspace('ROLE_REVIEW.md')
  const roleReviewComplete = !/\bpending\b/i.test(roleReviewText) && /Final decision:\s*pass(ed)?\b/i.test(roleReviewText)
  const artifactsText = readWorkspace('ARTIFACTS.md')
  const artifactsComplete = !/\bpending\b/i.test(artifactsText)

  const defects = parseTsv(readWorkspace('DEFECT_LOG.tsv'))
  const openDefects = defects.filter((row) => !COMPLETED_STATUSES.has(String(row.Status || '').trim().toLowerCase())).length
  const defectsMissingSecondVerification = defects.filter((row) => !String(row['Second verification'] || '').trim()).length

  const ledger = parseTsv(readWorkspace('EXPECTED_ACTUAL_LEDGER.tsv'))
  const ledgerComplete =
    ledger.length >= 8 &&
    ledger.every((row) =>
      ['Expected before click', 'Actual after click', 'Second verification', 'Result'].every((key) =>
        String(row[key] || '').trim()
      )
    ) &&
    ledger.every((row) => /^pass(ed)?$/i.test(String(row.Result || '').trim()))

  const deliveryAuditCompleted = /visualReview=completed|Three rounds of screenshot\/Computer Use visual review.*\|\s*Completed/i.test(
    auditText
  )
  const paused =
    auditText.includes('visualReview=paused') ||
    /Three rounds of screenshot\/Computer Use visual review.*\|\s*Paused/i.test(auditText) ||
    templateFiles.length > 0 ||
    missingScreenshots.length > 0

  const blockers = []
  if (missingScreenshots.length) blockers.push(`Missing screenshots: ${missingScreenshots.length}`)
  if (templateFiles.length) blockers.push(`Template or pending files remain: ${templateFiles.join(', ')}`)
  if (roundFailures.length) blockers.push(`Round pass/fail not complete: ${roundFailures.join(', ')}`)
  if (!roleReviewComplete) blockers.push('Role review is incomplete')
  if (!artifactsComplete) blockers.push('Artifact evidence is incomplete')
  if (openDefects) blockers.push(`Open defects remain: ${openDefects}`)
  if (defectsMissingSecondVerification) blockers.push(`Defects missing second verification: ${defectsMissingSecondVerification}`)
  if (!ledgerComplete) blockers.push('Expected/actual ledger is incomplete')
  if (!deliveryAuditCompleted) blockers.push('Delivery readiness audit has not been switched to completed visual evidence')

  return {
    complete: blockers.length === 0,
    paused,
    blockers,
    missingScreenshots,
    presentScreenshots,
    templateFiles,
    roundFailures,
    roleReviewComplete,
    artifactsComplete,
    defectRows: defects.length,
    openDefects,
    defectsMissingSecondVerification,
    ledgerRows: ledger.length,
    ledgerComplete,
    deliveryAuditCompleted,
  }
}

function buildReport(result) {
  const lines = [
    '# Round 71 - Visual Review Completion Audit',
    '',
    'Date: 2026-06-28',
    '',
    'This audit does not run Computer Use and does not capture screenshots. It checks whether the prepared visual-review workspace contains enough filled evidence to mark the screenshot/Computer Use requirement complete.',
    '',
    `Status: ${result.complete ? 'complete' : 'paused'}`,
    '',
    'Future completion command:',
    '',
    '```text',
    'npm run audit:visual-review-completion:complete',
    '```',
    '',
    '## Summary',
    '',
    `- Required screenshots present: ${result.presentScreenshots}/${REQUIRED_SCREENSHOTS.length}`,
    `- Defect rows: ${result.defectRows}`,
    `- Open defects: ${result.openDefects}`,
    `- Expected/actual ledger rows: ${result.ledgerRows}`,
    `- Role review complete: ${result.roleReviewComplete}`,
    `- Artifact evidence complete: ${result.artifactsComplete}`,
    `- Delivery audit switched to completed visual evidence: ${result.deliveryAuditCompleted}`,
    '',
    '## Blockers',
    '',
  ]
  if (result.blockers.length) result.blockers.forEach((item) => lines.push(`- ${item}`))
  else lines.push('- None')
  lines.push('', '## Missing Screenshots', '')
  if (result.missingScreenshots.length) result.missingScreenshots.forEach((item) => lines.push(`- ${item}`))
  else lines.push('- None')
  lines.push(
    '',
    '## Verdict',
    '',
    result.complete
      ? 'Visual review evidence is complete.'
      : 'Visual review evidence is not complete. Keep final delivery paused.'
  )
  return `${lines.join('\n')}\n`
}

function parseTsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
  if (lines.length <= 1) return []
  const headers = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const values = line.split('\t')
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']))
  })
}

function readWorkspace(fileName) {
  return fs.readFileSync(path.join(WORKSPACE_DIR, fileName), 'utf8')
}

function assertFile(filePath) {
  assert(fs.existsSync(filePath), `Expected file to exist: ${filePath}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
