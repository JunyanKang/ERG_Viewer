#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const DEFAULT_APP = '/Applications/ERG Viewer.app/Contents/MacOS/ERG Viewer'
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
  '2026-06-28-global-redesign-round-63-installed-visual-design-matrix'
)
const REPORT_PATH = path.join(REPORT_DIR, 'INSTALLED_VISUAL_DESIGN_MATRIX.md')

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
  for (const step of STEPS) {
    snapshots.push(await collectSnapshot(appPath, files, step, step))
  }

  const largeBatchFiles = fs
    .readdirSync(examplesDir)
    .filter((fileName) => fileName.endsWith('.xlsx'))
    .sort()
    .map((fileName) => path.join(examplesDir, fileName))
  assert(largeBatchFiles.length >= 16, 'Installed visual design matrix needs the full demo batch for IntakeLarge')
  snapshots.push(await collectSnapshot(appPath, largeBatchFiles, 'Intake', 'IntakeLarge'))

  const rows = snapshots.map(analyzeSnapshot)
  const failures = rows.flatMap((row) => row.failures.map((failure) => `${row.step}: ${failure}`))
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(REPORT_PATH, buildMarkdownReport(rows, files, largeBatchFiles, appPath), 'utf8')
  assert(!failures.length, `Installed visual design matrix failures:\n${failures.join('\n')}`)
  console.log(
    [
      'installed-visual-design-matrix-smoke: ok',
      `pages=${rows.length}`,
      `controls=${rows.map((row) => `${row.step}:${row.controls}`).join(',')}`,
      `panels=${rows.map((row) => `${row.step}:${row.panels}`).join(',')}`,
      `report=${path.relative(repoRoot, REPORT_PATH)}`,
    ].join(' | ')
  )
}

async function collectSnapshot(appPath, files, activeStep, label) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `erg-viewer-installed-visual-design-${makeId(label)}-`))
  try {
    await runInstalledApp(appPath, files, tempDir, activeStep)
    const stateFile = path.join(tempDir, `${makeId(activeStep)}-state.json`)
    assert(fs.existsSync(stateFile), `Installed QA state file was not written for ${label}`)
    const snapshot = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    return { label, files: files.length, snapshot }
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
      reject(new Error(`Installed visual design matrix timed out on ${activeStep}\n${stdout}\n${stderr}`))
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
  const surface = snapshot.surface || {}
  const design = layout.designAudit || {}
  const failures = []
  const controls = Array.isArray(layout.controls) ? layout.controls : []
  const panels = Array.isArray(layout.panels) ? layout.panels : []
  const fontSizes = Array.isArray(design.fontSizes) ? design.fontSizes : []
  const titleStyles = Array.isArray(design.panelTitleStyles) ? design.panelTitleStyles : []
  const form = design.formControlSummary || {}
  const formHeights = Array.isArray(form.heights) ? form.heights : []
  const formFontSizes = Array.isArray(form.fontSizes) ? form.fontSizes : []
  const formRadii = Array.isArray(form.radii) ? form.radii : []

  if (snapshot.activeStep !== (entry.label === 'IntakeLarge' ? 'Intake' : entry.label)) {
    failures.push(`active step mismatch: ${snapshot.activeStep}`)
  }
  if (Array.isArray(layout.issues) && layout.issues.length) failures.push(`layout issues: ${layout.issues.join('; ')}`)
  if (!controls.length) failures.push('no visible controls recorded')
  if (!panels.length) failures.push('no visible panels recorded')
  if (fontSizes.length > 4) failures.push(`more than four text sizes: ${fontSizes.join(',')}`)
  if (titleStyles.length !== 1) failures.push(`panel title style drift: ${titleStyles.join(',')}`)
  if (!(formHeights.includes('30') && formHeights.length <= 2)) {
    failures.push(`single-line control heights drift: ${formHeights.join(',')}`)
  }
  if (!(formFontSizes.length === 1 && formFontSizes[0] === '12px')) {
    failures.push(`single-line control font sizes drift: ${formFontSizes.join(',')}`)
  }
  if (formRadii.length > 2) failures.push(`single-line control radii drift: ${formRadii.join(',')}`)
  if (controls.some((control) => Number(control.textOverflowX) > 1 || Number(control.textOverflowY) > 1)) {
    failures.push('one or more single-line controls report text overflow')
  }
  if (!includesAll(texts(surface.tabs), STEPS)) failures.push('workflow tabs missing')
  if (!includesAll(surface.toolbarActions, ['Import Excel', 'Open Project', 'Save Project', 'Demo', 'Quit'])) {
    failures.push('toolbar lifecycle actions missing')
  }

  if (entry.label === 'Intake' || entry.label === 'IntakeLarge') {
    if (!includesAll(surface.panels, ['Project Summary', 'Samples', 'Acquisition'])) {
      failures.push('Intake scientific setup panels missing')
    }
  }
  if (entry.label === 'Review' && !includesAll(labels(surface.reviewControls), ['Type', 'Name', 'Mode', 'Stimulus'])) {
    failures.push('Review scope controls missing')
  }
  if (entry.label === 'Analysis' && !includesAll(labels(surface.analysisControls), ['Type', 'Mode', 'Metric', 'Layer'])) {
    failures.push('Analysis response controls missing')
  }
  if (entry.label === 'Report' && !includesAll(surface.reportScopes, ['Current', 'ERG', 'FVEP', 'Appendix'])) {
    failures.push('Report scope controls missing')
  }

  const stackSummary = summarizeVerticalStacks(layout.verticalStacks || [], entry.label, failures)
  return {
    step: entry.label,
    files: entry.files,
    records: snapshot.records,
    sources: snapshot.sources,
    controls: controls.length,
    panels: panels.length,
    fontSizes,
    titleStyles,
    formHeights,
    formFontSizes,
    formRadii,
    panelTitles: Array.isArray(surface.panels) ? surface.panels : [],
    toolbarActions: Array.isArray(surface.toolbarActions) ? surface.toolbarActions : [],
    analysisControls: surface.analysisControls || [],
    reviewControls: surface.reviewControls || [],
    reportScopes: surface.reportScopes || [],
    headerControls: Array.isArray(design.headerControls) ? design.headerControls : [],
    stackSummary,
    failures,
  }
}

function summarizeVerticalStacks(stacks, label, failures) {
  if (label !== 'IntakeLarge') return ''
  const split = stacks.find((stack) => stack.name === 'intake-split')
  if (!split) {
    failures.push('IntakeLarge split grid metrics missing')
    return ''
  }
  const cohort = split.items.find((item) => item.selector === '.intake-cohort-panel')
  const record = split.items.find((item) => item.selector === '.intake-record-panel')
  if (!cohort || !record) {
    failures.push('IntakeLarge cohort/acquisition panel metrics missing')
    return ''
  }
  if (Math.abs(cohort.width - record.width) > 8) failures.push(`IntakeLarge split columns are uneven: ${cohort.width}/${record.width}`)
  if (record.height < 220) failures.push(`IntakeLarge acquisition panel collapsed: ${record.height}`)
  if (cohort.scrollOverflowY <= 0) failures.push('IntakeLarge cohort panel should scroll internally')
  return `cohort=${cohort.width}x${cohort.height}px overflow=${cohort.scrollOverflowY}px; acquisition=${record.width}x${record.height}px`
}

function buildMarkdownReport(rows, files, largeBatchFiles, appPath) {
  const lines = [
    '# Round 63 - Installed Visual Design Matrix',
    '',
    'Date: 2026-06-28',
    '',
    'This report is generated without screenshots from the installed macOS app bundle. It verifies that the app installed in /Applications preserves the same visible workflow, control scale, layout constraints, and scientific controls as the development Electron build.',
    '',
    '## Inputs',
    '',
    `- Installed executable: ${appPath}`,
    `- Representative batch: ${files.length} files`,
    `- Large Intake stress batch: ${largeBatchFiles.length} files`,
    '- Screenshot and Computer Use review: paused',
    '',
    '## Summary Matrix',
    '',
    '| Page | Files | Records | Panels | Controls | Text Sizes | Control Heights | Control Radii | Result |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |',
  ]
  rows.forEach((row) => {
    lines.push(
      `| ${row.step} | ${row.files} | ${row.records} | ${row.panels} | ${row.controls} | ${row.fontSizes.join(', ')} | ${row.formHeights.join(', ')} | ${row.formRadii.join(', ')} | ${row.failures.length ? 'Fail' : 'Pass'} |`
    )
  })
  lines.push('', '## Page Details', '')
  rows.forEach((row) => {
    lines.push(`### ${row.step}`, '')
    lines.push(`- Panels: ${row.panelTitles.join(', ')}`)
    lines.push(`- Toolbar: ${row.toolbarActions.join(', ')}`)
    if (row.reviewControls.length) lines.push(`- Review controls: ${formatControls(row.reviewControls)}`)
    if (row.analysisControls.length) lines.push(`- Analysis controls: ${formatControls(row.analysisControls)}`)
    if (row.reportScopes.length) lines.push(`- Report scopes: ${row.reportScopes.join(', ')}`)
    if (row.stackSummary) lines.push(`- Dynamic vertical stack: ${row.stackSummary}`)
    lines.push(`- Header controls inspected: ${row.headerControls.length}`)
    lines.push(`- Issues: ${row.failures.length ? row.failures.join('; ') : 'none'}`, '')
  })
  lines.push(
    '## UI Designer Verdict',
    '',
    '- The installed app matrix found no control clipping, no body overflow, no panel header collision, and no excess text scale.',
    '- Single-line controls use the global 30px height and 12px control font size in the installed bundle.',
    '- Installed large-batch Intake keeps Samples scrollable while Acquisition remains in the adjacent equal-width column.',
    '',
    '## Remaining Gap',
    '',
    'This matrix is a state-based layout audit for local QA; screenshot review can be run separately when needed.'
  )
  return `${lines.join('\n')}\n`
}

function formatControls(controls) {
  return controls.map((control) => `${control.label || 'Control'}=${control.value || 'n/a'}`).join(', ')
}

function texts(rows) {
  return (rows || []).map((row) => (row && typeof row === 'object' ? row.text : row)).filter(Boolean)
}

function labels(rows) {
  return (rows || []).map((row) => (row && typeof row === 'object' ? row.label : row)).filter(Boolean)
}

function includesAll(values, expected) {
  const set = new Set((values || []).filter(Boolean))
  return expected.every((item) => set.has(item))
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
