#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const XLSX = require('xlsx')

const electron = require('electron')

const projectCore = require('../src-v2/renderer/core/project')
const analysisCore = require('../src-v2/renderer/core/analysis')
const reportCore = require('../src-v2/renderer/core/report')
const exportCore = require('../src-v2/renderer/core/export')

const STEPS = ['Intake', 'Review', 'Analysis', 'Report']
const DEFAULT_FILES = [
  'demo-control-1_FERG.xlsx',
  'demo-cko-1_FERG.xlsx',
  'demo-control-1_FVEP.xlsx',
  'demo-cko-1_FVEP.xlsx',
]

const ERG_PUBLICATION_PANELS = [
  'a-wave amp response',
  'b-wave amp response',
  'OP/dOps summed amp',
  'Flicker amp summary',
  'Flicker phase summary',
]

const FVEP_PUBLICATION_PANELS = [
  'P1-N1 amp summary',
  'P1-N2 amp summary',
  'P2-N2 amp summary',
  'N1 latency summary',
  'P1 latency summary',
  'N2 latency summary',
  'P2 latency summary',
]

async function main() {
  const repoRoot = path.join(__dirname, '..')
  const examplesDir = path.join(repoRoot, 'docs', 'examples')
  const files =
    process.argv.length > 2
      ? process.argv.slice(2).map((filePath) => path.resolve(filePath))
      : DEFAULT_FILES.map((name) => path.join(examplesDir, name))
  files.forEach((filePath) => assert(fs.existsSync(filePath), `Missing input file ${filePath}`))

  const snapshots = {}
  for (const step of STEPS) {
    snapshots[step] = await collectSnapshot(repoRoot, files, step)
  }
  const scientific = buildScientificReview(files)
  const reviews = [
    graduateReview(snapshots, scientific),
    professorReview(snapshots, scientific),
    productReview(snapshots, scientific),
    uiDesignerReview(snapshots),
  ]
  const failures = reviews.flatMap((review) => review.findings.filter((finding) => finding.severity !== 'pass'))
  assert(
    failures.length === 0,
    `Role review findings:\n${failures.map((finding) => `${finding.role}: ${finding.item}: ${finding.detail}`).join('\n')}`
  )
  console.log(
    [
      'electron-role-review-smoke: ok',
      `roles=${reviews.length}`,
      `findings=${reviews.reduce((sum, review) => sum + review.findings.length, 0)}`,
      `records=${snapshots.Intake.records}`,
      `sources=${snapshots.Intake.sources}`,
      `ergPanels=${scientific.ergPanels}`,
      `fvepPanels=${scientific.fvepPanels}`,
    ].join(' | ')
  )
}

async function collectSnapshot(repoRoot, files, step) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `erg-viewer-electron-role-${step.toLowerCase()}-`))
  try {
    await runElectron(repoRoot, files, tempDir, step)
    const stateFile = path.join(tempDir, `${makeId(step)}-state.json`)
    assert(fs.existsSync(stateFile), `QA state file was not written for ${step}`)
    const snapshot = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    assert(snapshot.activeStep === step, `${step} activeStep mismatch: ${snapshot.activeStep}`)
    return snapshot
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function runElectron(repoRoot, files, stateDir, activeStep) {
  return new Promise((resolve, reject) => {
    const child = spawn(electron, [repoRoot, ...files], {
      cwd: repoRoot,
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
      reject(new Error(`Electron role review timed out on ${activeStep}\n${stdout}\n${stderr}`))
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
      else reject(new Error(`Electron exited with ${code} on ${activeStep}\n${stdout}\n${stderr}`))
    })
  })
}

function buildScientificReview(files) {
  const samples = files.flatMap((filePath) => projectCore.parseWorkbookToSamples(XLSX.readFile(filePath), filePath))
  const project = projectCore.normalizeProject({
    title: 'QA role review batch',
    savedAt: '2026-06-28T00:00:00.000Z',
    samples,
    sources: projectCore.deriveSources(samples),
    settings: {
      activeStep: 'Report',
      metricKey: 'bAmplitudeUv',
      metricVersion: 'raw',
      recordFilter: 'All',
      biologicalUnit: 'subject',
      eyeAggregation: 'average-eyes',
      comparisonDesign: 'independent',
    },
  })
  const erg = scenario(project, {
    reportScope: 'erg-preset',
    plan: { sourceType: 'ERG', protocolMode: 'All', condition: 'All', metricKey: 'bAmplitudeUv' },
  })
  const fvep = scenario(project, {
    reportScope: 'fvep-preset',
    plan: { sourceType: 'FVEP', protocolMode: 'FVEP', condition: 'All', metricKey: 'p1n1AmplitudeUv' },
  })
  return {
    project,
    erg,
    fvep,
    ergPanels: ERG_PUBLICATION_PANELS.filter((fragment) => erg.html.includes(fragment)).length,
    fvepPanels: FVEP_PUBLICATION_PANELS.filter((fragment) => fvep.html.includes(fragment)).length,
  }
}

function scenario(project, config) {
  const plan = analysisCore.buildAnalysisPlan(project, {
    ...config.plan,
    metricVersion: 'raw',
    biologicalUnit: 'subject',
    eyeAggregation: 'average-eyes',
    comparisonDesign: 'independent',
  })
  const result = analysisCore.runAnalysis(project, plan)
  const report = reportCore.buildReportPackage(project, result, { reportScope: config.reportScope })
  const html = exportCore.buildReportHtml(project, result, report)
  return { plan, result, report, html }
}

function graduateReview(snapshots, scientific) {
  const findings = []
  passIf(findings, 'Graduate Student', 'Import-to-analysis flow', snapshots.Intake.records === 54 && snapshots.Intake.sources === 4, 'demo batch imports four files and complete stimulus-series records')
  passIf(findings, 'Graduate Student', 'Samples setup is visible at intake', includesAll(snapshots.Intake.surface.panels, ['Project Summary', 'Samples', 'Acquisition']), 'project summary, file-level cohorts, and acquisition rows are available before review')
  passIf(findings, 'Graduate Student', 'Review has manual correction context', includesAll(snapshots.Review.surface.reviewControls.map((row) => row.label), ['Type', 'Name', 'Mode', 'Stimulus']), 'review exposes source type, file name, acquisition mode, and stimulus controls before manual correction')
  passIf(findings, 'Graduate Student', 'Analysis has copyable source rows', snapshots.Analysis.analysisSourceRows > 0 && snapshots.Analysis.gates.canCopyAnalysisCsv, 'analysis source table is available for reproducibility')
  passIf(findings, 'Graduate Student', 'Report export is ready', snapshots.Report.gates.canExportPdf && snapshots.Report.gates.canExportWorkbook, 'PDF and XLSX outputs are available after analysis')
  passIf(findings, 'Graduate Student', 'Source rows retain traceability', scientific.erg.result.sourceRows.every((row) => row.sampleId && row.subjectId && row.metric), 'analysis rows include sample, subject, and metric identifiers')
  return { role: 'Graduate Student', findings }
}

function professorReview(snapshots, scientific) {
  const findings = []
  const scopes = new Map((snapshots.Report.reportScopes || []).map((scope) => [scope.id, scope]))
  passIf(findings, 'Professor', 'ERG preset is publication-ready', scopeReady(scopes.get('erg-preset'), 7), 'ERG preset has ready figures for representative traces and endpoint summaries')
  passIf(findings, 'Professor', 'FVEP preset is publication-ready', scopeReady(scopes.get('fvep-preset'), 4), 'FVEP preset has representative traces plus amp and latency quantification')
  passIf(findings, 'Professor', 'ERG endpoint panels are rendered', scientific.ergPanels === ERG_PUBLICATION_PANELS.length, `${scientific.ergPanels}/${ERG_PUBLICATION_PANELS.length} ERG rendered panels found`)
  passIf(findings, 'Professor', 'FVEP endpoint panels are rendered', scientific.fvepPanels === FVEP_PUBLICATION_PANELS.length, `${scientific.fvepPanels}/${FVEP_PUBLICATION_PANELS.length} FVEP rendered panels found`)
  passIf(findings, 'Professor', 'Readiness has no errors', noReadinessErrors(scientific.erg.report) && noReadinessErrors(scientific.fvep.report), 'report readiness contains no error-level blockers')
  return { role: 'Professor', findings }
}

function productReview(snapshots) {
  const findings = []
  passIf(findings, 'Product Manager', 'Navigation exposes four workflow stages', includesAll(snapshots.Intake.surface.tabs.map((row) => row.text), STEPS), 'tabs match intake-review-analysis-report workflow')
  passIf(findings, 'Product Manager', 'Toolbar has core project lifecycle actions', includesAll(snapshots.Intake.surface.toolbarActions, ['Import Excel', 'Open Project', 'Save Project', 'Demo', 'Quit']), 'project load/save/quit actions are discoverable')
  passIf(findings, 'Product Manager', 'Report scopes separate ERG and FVEP', includesAll(snapshots.Report.surface.reportScopes, ['Current', 'ERG', 'FVEP', 'Appendix']), 'report scope selector exposes current, ERG, FVEP, and appendix views')
  passIf(findings, 'Product Manager', 'Stage gates are coherent', snapshots.Review.gates.canReview && snapshots.Analysis.gates.canExportWorkbook && snapshots.Report.gates.canExportPdf, 'available actions match imported data state')
  return { role: 'Product Manager', findings }
}

function uiDesignerReview(snapshots) {
  const findings = []
  Object.entries(snapshots).forEach(([step, snapshot]) => {
    const audit = snapshot.layout.designAudit || {}
    passIf(findings, 'UI Designer', `${step} has no layout issues`, Array.isArray(snapshot.layout.issues) && snapshot.layout.issues.length === 0, 'no overlap, clipping, visible scrollbar, or body overflow')
    passIf(findings, 'UI Designer', `${step} uses no more than four text sizes`, Array.isArray(audit.fontSizes) && audit.fontSizes.length <= 4, `font sizes: ${(audit.fontSizes || []).join(',')}`)
    passIf(findings, 'UI Designer', `${step} panel title style is consistent`, Array.isArray(audit.panelTitleStyles) && audit.panelTitleStyles.length === 1, `panel title styles: ${(audit.panelTitleStyles || []).join(',')}`)
    passIf(findings, 'UI Designer', `${step} single-line controls use the global size`, audit.formControlSummary && audit.formControlSummary.heights.includes('30'), `control heights: ${((audit.formControlSummary && audit.formControlSummary.heights) || []).join(',')}`)
  })
  return { role: 'UI Designer', findings }
}

function passIf(findings, role, item, condition, detail) {
  findings.push({ role, item, severity: condition ? 'pass' : 'fail', detail })
}

function includesAll(values, expected) {
  const set = new Set((values || []).filter(Boolean))
  return expected.every((item) => set.has(item))
}

function scopeReady(scope, minReady) {
  return Boolean(scope && scope.records > 0 && scope.readyFigures >= minReady && scope.totalFigures >= scope.readyFigures)
}

function noReadinessErrors(report) {
  return Boolean(report && Array.isArray(report.readiness) && report.readiness.every((row) => row.status !== 'error'))
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
