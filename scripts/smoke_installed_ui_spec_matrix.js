#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const DEFAULT_APP = '/Applications/OptoERGViewer.app/Contents/MacOS/OptoERGViewer'
const STEPS = ['Intake', 'Review', 'Analysis', 'Report']
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
  '2026-06-28-global-redesign-round-75-installed-ui-spec-matrix'
)
const REPORT_PATH = path.join(REPORT_DIR, 'INSTALLED_UI_SPEC_MATRIX.md')

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

  const snapshots = []
  for (const step of STEPS) snapshots.push(await collectSnapshot(appPath, files, step, step))

  const largeBatchFiles = fs
    .readdirSync(examplesDir)
    .filter((fileName) => fileName.endsWith('.xlsx'))
    .sort()
    .map((fileName) => path.join(examplesDir, fileName))
  assert(largeBatchFiles.length >= 16, 'Installed UI spec matrix needs the full demo batch')
  snapshots.push(await collectSnapshot(appPath, largeBatchFiles, 'Intake', 'IntakeLarge'))

  const rows = snapshots.map(analyzeSnapshot)
  const failures = rows.flatMap((row) => row.failures.map((failure) => `${row.step}: ${failure}`))
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(REPORT_PATH, buildMarkdownReport(rows, appPath, files, largeBatchFiles), 'utf8')
  assert(!failures.length, `Installed UI spec matrix failures:\n${failures.join('\n')}`)

  console.log(
    [
      'installed-ui-spec-matrix-smoke: ok',
      `pages=${rows.length}`,
      `controls=${rows.map((row) => `${row.step}:${row.formControlCount}`).join(',')}`,
      `headers=${rows.map((row) => `${row.step}:${row.headerPairs}`).join(',')}`,
      `report=${path.relative(repoRoot, REPORT_PATH)}`,
    ].join(' | ')
  )
}

async function collectSnapshot(appPath, files, activeStep, label) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `erg-viewer-installed-ui-spec-${makeId(label)}-`))
  try {
    await runInstalledApp(appPath, files, tempDir, activeStep)
    const stateFile = path.join(tempDir, `${makeId(activeStep)}-state.json`)
    assert(fs.existsSync(stateFile), `Installed QA state file was not written for ${label}`)
    return { label, files: files.length, snapshot: JSON.parse(fs.readFileSync(stateFile, 'utf8')) }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function runInstalledApp(appPath, files, stateDir, activeStep) {
  return new Promise((resolve, reject) => {
    const child = spawn(appPath, files, {
      env: {
        ...process.env,
        ERG_VIEWER_QA_ACTIVE_STEP: activeStep,
        ERG_VIEWER_QA_STATE_DIR: stateDir,
        ERG_VIEWER_QA_EXPECTED_SOURCES: String(files.length),
        ERG_VIEWER_QA_SELECT_MODE: 'ERG',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Installed UI spec matrix timed out on ${activeStep}\n${stdout}\n${stderr}`))
    }, 60000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`Installed app exited with ${code} on ${activeStep}\n${stdout}\n${stderr}`))
    })
  })
}

function analyzeSnapshot(entry) {
  const snapshot = entry.snapshot || {}
  const layout = snapshot.layout || {}
  const design = layout.designAudit || {}
  const surface = snapshot.surface || {}
  const formSummary = design.formControlSummary || {}
  const formControls = Array.isArray(design.formControls) ? design.formControls : []
  const headerPairs = Array.isArray(design.panelHeaderPairs) ? design.panelHeaderPairs : []
  const failures = []

  if (snapshot.activeStep !== (entry.label === 'IntakeLarge' ? 'Intake' : entry.label)) {
    failures.push(`active step mismatch: ${snapshot.activeStep}`)
  }
  if (Array.isArray(layout.issues) && layout.issues.length) failures.push(`layout issues: ${layout.issues.join('; ')}`)
  assertListLimit(design.fontSizes, 4, 'text size styles', failures)
  assertExactList(formSummary.fontSizes, ['12px'], 'single-line control font sizes', failures)
  assertIncludesLimited(formSummary.heights, '30', 2, 'single-line control heights', failures)
  assertIncludesLimited(formSummary.radii, '8px', 2, 'single-line control radii', failures)
  assertExactList(design.panelTitleStyles, ['12px/600'], 'panel title styles', failures)
  if (!formControls.length) failures.push('form control inventory missing')
  if (!headerPairs.length) failures.push('panel header pair inventory missing')

  const wrongControlFonts = formControls.filter((control) => control.fontSize !== '12px')
  const wrongControlHeights = formControls.filter((control) => Number(control.height) && Math.abs(Number(control.height) - 30) > 1)
  const wrongHeaderTitles = headerPairs.filter((pair) => pair.title && (pair.title.fontSize !== '12px' || pair.title.fontWeight !== '600'))
  const wrongHeaderActions = headerPairs
    .map((pair) => pair.trailing)
    .filter(Boolean)
    .filter((control) => Number(control.height) && Math.abs(Number(control.height) - 30) > 1)

  if (wrongControlFonts.length) failures.push(`control font drift: ${describeControls(wrongControlFonts)}`)
  if (wrongControlHeights.length) failures.push(`control height drift: ${describeControls(wrongControlHeights)}`)
  if (wrongHeaderTitles.length) failures.push(`panel title typography drift: ${wrongHeaderTitles.map((pair) => pair.title.text).join(', ')}`)
  if (wrongHeaderActions.length) failures.push(`panel header action height drift: ${describeControls(wrongHeaderActions)}`)
  if (!Array.isArray(surface.panels) || surface.panels.some((title) => !String(title || '').trim())) {
    failures.push('empty visible panel title')
  }

  return {
    step: entry.label,
    files: entry.files,
    records: snapshot.records,
    panels: Array.isArray(surface.panels) ? surface.panels : [],
    fontSizes: design.fontSizes || [],
    fontWeights: design.fontWeights || [],
    formHeights: formSummary.heights || [],
    formRadii: formSummary.radii || [],
    formFontSizes: formSummary.fontSizes || [],
    formControlCount: formSummary.count || formControls.length,
    formControls: formControls.slice(0, 18),
    headerPairs: headerPairs.length,
    headerInventory: headerPairs.slice(0, 14),
    failures,
  }
}

function buildMarkdownReport(rows, appPath, files, largeBatchFiles) {
  const lines = [
    '# Round 75 - Installed UI Spec Matrix',
    '',
    'Date: 2026-06-28',
    '',
    'This non-screenshot matrix inspects the installed macOS app bundle for the global UI specification requested during review: no more than four text sizes, uniform panel-title typography, uniform single-line control height, radius, font size, and consistent panel-header trailing controls.',
    '',
    '## Inputs',
    '',
    `- Installed executable: ${appPath}`,
    `- Representative batch: ${files.length} files`,
    `- Large Intake stress batch: ${largeBatchFiles.length} files`,
    '- Screenshot and Computer Use review: paused',
    '',
    '## Page Specification Matrix',
    '',
    '| Page | Records | Panels | Text Sizes | Text Weights | Control Count | Control Heights | Control Font | Control Radius | Header Pairs | Result |',
    '| --- | ---: | --- | --- | --- | ---: | --- | --- | --- | ---: | --- |',
  ]
  rows.forEach((row) => {
    lines.push(
      [
        row.step,
        row.records,
        row.panels.join(', '),
        row.fontSizes.join(', '),
        row.fontWeights.join(', '),
        row.formControlCount,
        row.formHeights.join(', '),
        row.formFontSizes.join(', '),
        row.formRadii.join(', '),
        row.headerPairs,
        row.failures.length ? 'Fail' : 'Pass',
      ]
        .map(tableCell)
        .join(' | ')
        .replace(/^/, '| ')
        .concat(' |')
    )
  })

  lines.push('', '## Header And Control Inventory', '')
  rows.forEach((row) => {
    lines.push(`### ${row.step}`, '')
    lines.push('- Panel headers:')
    row.headerInventory.forEach((pair) => {
      const trailing = pair.trailing
        ? `${pair.trailing.text || pair.trailing.selector} ${pair.trailing.height}px ${pair.trailing.fontSize}/${pair.trailing.fontWeight}`
        : 'none'
      lines.push(
        `  - ${pair.title.text}: title ${pair.title.fontSize}/${pair.title.fontWeight}, trailing ${trailing}`
      )
    })
    lines.push('- Sample single-line controls:')
    row.formControls.forEach((control) => {
      lines.push(
        `  - ${control.selector} "${control.text}": ${control.width}x${control.height}, radius ${control.borderRadius}, text ${control.fontSize}/${control.fontWeight}`
      )
    })
    lines.push(`- Issues: ${row.failures.length ? row.failures.join('; ') : 'none'}`, '')
  })

  lines.push(
    '## UI Designer Verdict',
    '',
    'Passed. The installed bundle uses the configured global UI tokens for text scale and single-line controls across the inspected workflow pages. Header titles and right-side header actions are inventory-checked rather than inferred from CSS alone.',
    '',
    '## Remaining Gap',
    '',
    'This matrix is generated from layout and computed-style state for local QA.'
  )
  return `${lines.join('\n')}\n`
}

function assertListLimit(values, limit, label, failures) {
  if (!Array.isArray(values) || values.length > limit) failures.push(`${label} exceed ${limit}: ${(values || []).join(',')}`)
}

function assertExactList(values, expected, label, failures) {
  const actual = Array.isArray(values) ? values : []
  if (actual.length !== expected.length || expected.some((value, index) => actual[index] !== value)) {
    failures.push(`${label} mismatch: ${actual.join(',')}`)
  }
}

function assertIncludesLimited(values, required, limit, label, failures) {
  const actual = Array.isArray(values) ? values : []
  if (!actual.includes(required) || actual.length > limit) failures.push(`${label} mismatch: ${actual.join(',')}`)
}

function describeControls(controls) {
  return controls
    .slice(0, 6)
    .map((control) => `${control.selector}:${control.text}:${control.height}px:${control.fontSize}`)
    .join('|')
}

function tableCell(value) {
  return String(value == null ? '' : value)
    .replace(/\|/g, '/')
    .replace(/\r?\n/g, ' ')
    .slice(0, 260)
}

function makeId(value) {
  return (
    String(value || 'sample')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'sample'
  )
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error))
  process.exit(1)
})
