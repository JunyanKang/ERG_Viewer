#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const WORKSPACE_DIR = path.join(__dirname, '..', 'docs', 'qa', '2026-06-28-final-visual-review-resumed')
const EXECUTION_PACKET = path.join(__dirname, '..', 'docs', 'VISUAL_REVIEW_EXECUTION_PACKET.md')

const DEFECT_FIELDS = [
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
  'Status',
]

const LEDGER_FIELDS = [
  'Round',
  'Screenshot',
  'Action or control',
  'Expected before click',
  'Actual after click',
  'Second verification',
  'Result',
]

const ROLES = ['Graduate Student', 'Professor', 'Product Manager', 'UI Designer']

const ROUNDS = [
  {
    id: 'A',
    file: 'ROUND_A_NOTES.md',
    title: 'Round A - Installed App Baseline',
    goal: 'Installed app starts cleanly, imports the representative batch, and each primary page is visually stable before interaction edits.',
    screenshots: [
      ['01-startup.png', 'Installed app first screen with top navigation and visible Quit entry', 'Window chrome, global spacing, first-run hierarchy'],
      ['02-intake-imported.png', 'Four imported source files, Project Summary, Samples, Acquisition', 'File-level sample controls, record list density, no overflow'],
      ['03-review-erg.png', 'ERG record selected with waveform and manual correction controls', 'ERG metric labels, manual-pick discoverability'],
      ['04-review-fvep.png', 'FVEP record selected with waveform and FVEP endpoint context', 'FVEP labels, amp/latency semantics'],
      ['05-analysis-erg.png', 'ERG analysis with source/protocol/condition/metric/layer/stats controls', 'ERG plotting logic and axis titles'],
      ['06-analysis-fvep.png', 'FVEP analysis with latency or amp output', 'FVEP plotting logic and units'],
      ['07-report-erg.png', 'ERG report scope selected with figures/source rows', 'Report scope clarity and export readiness'],
      ['08-report-fvep.png', 'FVEP report scope selected with figures/source rows', 'FVEP report completeness'],
    ],
  },
  {
    id: 'B',
    file: 'ROUND_B_NOTES.md',
    title: 'Round B - Control Interaction and Manual Correction',
    goal: 'Major controls respond through real GUI operation and manual correction remains visually understandable.',
    screenshots: [
      ['01-intake-cohort-edited.png', 'Group and Pair ID edited from the UI', 'Expected/actual state and field readability'],
      ['02-review-included-toggle.png', 'Include/exclude state changed for selected record', 'State feedback and downstream gating'],
      ['03-review-manual-pick-armed.png', 'Manual pick target armed', 'Target selector visibility and annotation placement'],
      ['04-review-manual-pick-nudged.png', 'Pick point moved by Computer Use nudge', 'Corrected value visibility and no annotation collision'],
      ['05-analysis-erg-dops-manual.png', 'ERG dOps manual-layer analysis', 'Manual metrics and source rows'],
      ['06-analysis-fvep-latency.png', 'FVEP latency metric selected', 'Latency units and plot title correctness'],
      ['07-report-scope-erg.png', 'Report scope switched to ERG', 'Sidebar/report linkage'],
      ['08-report-scope-fvep.png', 'Report scope switched to FVEP', 'Sidebar/report linkage'],
    ],
  },
  {
    id: 'C',
    file: 'ROUND_C_NOTES.md',
    title: 'Round C - Project Reopen and Release Artifact',
    goal: 'Saved projects, release artifacts, export paths, and quit behavior are visually and functionally coherent.',
    screenshots: [
      ['01-open-project-dialog.png', 'Project open dialog or selected project path', 'Dialog clarity and path readability'],
      ['02-reopened-review.png', 'Reopened project on Review with corrected values preserved', 'State reproduction and manual correction persistence'],
      ['03-reopened-analysis.png', 'Reopened project on Analysis with source rows present', 'Analysis reproducibility'],
      ['04-reopened-report.png', 'Reopened project on Report with scopes available', 'Report reproducibility'],
      ['05-exported-workbook-ready.png', 'XLSX export completed or export destination visible', 'Export readiness and feedback'],
      ['06-exported-pdf-ready.png', 'PDF export completed or export destination visible', 'PDF readiness and feedback'],
      ['07-quit-entry.png', 'Visible Quit entry before app exit', 'Quit discoverability and no conflict with export actions'],
    ],
  },
]

function main() {
  const checkOnly = process.argv.includes('--check')
  if (!checkOnly) writeWorkspace()
  verifyWorkspace()
  console.log(
    [
      'visual-review-workspace-smoke: ok',
      `rounds=${ROUNDS.length}`,
      `screenshots=${ROUNDS.reduce((sum, round) => sum + round.screenshots.length, 0)}`,
      `defectFields=${DEFECT_FIELDS.length}`,
      `ledgerFields=${LEDGER_FIELDS.length}`,
      `mode=${checkOnly ? 'check' : 'write'}`,
      `dir=${path.relative(path.join(__dirname, '..'), WORKSPACE_DIR)}`,
    ].join(' | ')
  )
}

function writeWorkspace() {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true })
  writeFile('README.md', buildReadme())
  writeFile('DEFECT_LOG.tsv', `${DEFECT_FIELDS.join('\t')}\n`)
  writeFile('EXPECTED_ACTUAL_LEDGER.tsv', `${LEDGER_FIELDS.join('\t')}\n`)
  writeFile('ROLE_REVIEW.md', buildRoleReview())
  writeFile('ARTIFACTS.md', buildArtifacts())
  ROUNDS.forEach((round) => writeFile(round.file, buildRoundNotes(round)))
}

function verifyWorkspace() {
  assertFile(EXECUTION_PACKET)
  assertFile(WORKSPACE_DIR)
  const requiredFiles = [
    'README.md',
    'DEFECT_LOG.tsv',
    'EXPECTED_ACTUAL_LEDGER.tsv',
    'ROLE_REVIEW.md',
    'ARTIFACTS.md',
    ...ROUNDS.map((round) => round.file),
  ]
  requiredFiles.forEach((fileName) => assertFile(path.join(WORKSPACE_DIR, fileName)))
  const readme = read('README.md')
  assert(readme.includes('Status: template'), 'Workspace README must stay template status')
  assert(readme.includes('does not prove completion'), 'Workspace README must preserve non-completion caveat')

  assert(read('DEFECT_LOG.tsv').split('\n')[0] === DEFECT_FIELDS.join('\t'), 'Defect log header mismatch')
  assert(read('EXPECTED_ACTUAL_LEDGER.tsv').split('\n')[0] === LEDGER_FIELDS.join('\t'), 'Expected/actual ledger header mismatch')

  const roleReview = read('ROLE_REVIEW.md')
  ROLES.forEach((role) => assert(roleReview.includes(`## ${role}`), `Role review missing ${role}`))
  ROUNDS.forEach((round) => {
    const notes = read(round.file)
    assert(notes.includes(`# ${round.title}`), `${round.file} title mismatch`)
    assert(notes.includes('Status: template'), `${round.file} must stay template status`)
    assert(notes.includes('Pass/Fail:'), `${round.file} missing pass/fail field`)
    round.screenshots.forEach(([name]) => assert(notes.includes(`\`${name}\``), `${round.file} missing ${name}`))
  })
}

function buildReadme() {
  return [
    '# Final Visual Review Resumed Workspace',
    '',
    'Status: template. This workspace is prepared for the paused Computer Use and screenshot review. It does not prove completion.',
    '',
    'Do not mark final delivery complete from these template files. Completion requires actual screenshots, Computer Use operations, filled notes, defect fixes, and second verification.',
    '',
    'Required preflight commands:',
    '',
    '```text',
    'npm run release:verify:mac',
    'npm run smoke:delivery-readiness',
    'npm run smoke:visual-review-preflight',
    'npm run smoke:visual-review-execution-packet',
    'npm run prepare:visual-review-workspace -- --check',
    '```',
    '',
    'Files:',
    '',
    '- `ROUND_A_NOTES.md`',
    '- `ROUND_B_NOTES.md`',
    '- `ROUND_C_NOTES.md`',
    '- `DEFECT_LOG.tsv`',
    '- `EXPECTED_ACTUAL_LEDGER.tsv`',
    '- `ROLE_REVIEW.md`',
    '- `ARTIFACTS.md`',
    '',
  ].join('\n')
}

function buildRoundNotes(round) {
  const lines = [
    `# ${round.title}`,
    '',
    'Status: template. Fill this only after actual screenshot and Computer Use review is resumed.',
    '',
    `Goal: ${round.goal}`,
    '',
    'Pass/Fail: pending',
    '',
    '## Screenshot Checklist',
    '',
    '| Screenshot | Required visible state | Primary review focus | Captured | Result | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  round.screenshots.forEach(([name, state, focus]) => {
    lines.push(`| \`${name}\` | ${state} | ${focus} | pending | pending |  |`)
  })
  lines.push(
    '',
    '## Role Review Summary',
    '',
    '- Graduate Student: pending',
    '- Professor: pending',
    '- Product Manager: pending',
    '- UI Designer: pending',
    '',
    '## Defects',
    '',
    'Record defects in `DEFECT_LOG.tsv` and expected/actual control checks in `EXPECTED_ACTUAL_LEDGER.tsv`.',
    '',
    '## Second Verification',
    '',
    'Every fixed defect must cite a second-verification screenshot or command.',
    ''
  )
  return lines.join('\n')
}

function buildRoleReview() {
  const lines = [
    '# Role Review Notes',
    '',
    'Status: template. Fill once screenshots and Computer Use review are resumed.',
    '',
  ]
  ROLES.forEach((role) => {
    lines.push(`## ${role}`, '', '- Round A: pending', '- Round B: pending', '- Round C: pending', '- Final decision: pending', '')
  })
  return lines.join('\n')
}

function buildArtifacts() {
  return [
    '# Visual Review Artifacts',
    '',
    'Status: template. Fill paths after actual project save, XLSX export, and PDF export.',
    '',
    '| Artifact | Path | Verification |',
    '| --- | --- | --- |',
    '| Saved project | pending | pending |',
    '| Exported workbook | pending | pending |',
    '| Exported PDF | pending | pending |',
    '| Installed app | `/Applications/ERG Viewer.app` | pending |',
    '',
  ].join('\n')
}

function writeFile(fileName, text) {
  fs.writeFileSync(path.join(WORKSPACE_DIR, fileName), text, 'utf8')
}

function read(fileName) {
  return fs.readFileSync(path.join(WORKSPACE_DIR, fileName), 'utf8')
}

function assertFile(filePath) {
  assert(fs.existsSync(filePath), `Expected file to exist: ${filePath}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
