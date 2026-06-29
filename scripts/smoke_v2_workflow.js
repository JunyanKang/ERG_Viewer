#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const XLSX = require('xlsx')

const projectCore = require('../src-v2/renderer/core/project')
const analysisCore = require('../src-v2/renderer/core/analysis')
const reportCore = require('../src-v2/renderer/core/report')
const exportCore = require('../src-v2/renderer/core/export')

const REQUIRED_SHEETS = [
  'samples',
  'groups',
  'metrics_raw',
  'metrics_manual',
  'metrics_corrected',
  'group_summary',
  'stimulus_summary',
  'stats',
  'figure_source',
  'corrections_log',
  'sources',
  'statistical_design',
  'analysis_plan',
  'analysis_source',
  'analysis_warnings',
  'paired_readiness',
  'report_figures',
  'report_scopes',
  'report_readiness',
]

function main() {
  const args = process.argv.slice(2)
  const suites = args.length ? [{ name: 'custom', files: args }] : defaultSuites()

  suites.forEach((suite) => runSuite(suite.name, suite.files))
  console.log(`v2 workflow smoke passed (${suites.length} suite${suites.length === 1 ? '' : 's'})`)
}

function defaultSuites() {
  const examplesDir = path.join(__dirname, '..', 'docs', 'examples')
  const allExampleFiles = fs
    .readdirSync(examplesDir)
    .filter((name) => name.endsWith('.xlsx'))
    .sort()
    .map((name) => path.join(examplesDir, name))
  return [
    { name: 'single-ferg', files: [path.join(examplesDir, 'demo-control-1_FERG.xlsx')] },
    { name: 'single-fvep', files: [path.join(examplesDir, 'demo-control-1_FVEP.xlsx')] },
    { name: 'mixed-example-batch', files: allExampleFiles },
  ]
}

function runSuite(name, files) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `erg-viewer-v2-${name}-`))
  try {
    files.forEach((file) => assert(fs.existsSync(file), `${name}: missing input file ${file}`))
    const samples = files.flatMap((file) => projectCore.parseWorkbookToSamples(XLSX.readFile(file), file))
    assert(samples.length > 0, `${name}: no acquisition records parsed`)

    const projectPath = path.join(tempDir, `${name}.ep`)
    const project = projectCore.normalizeProject({
      title: `Smoke ${name}`,
      savedAt: new Date('2026-06-28T00:00:00.000Z').toISOString(),
      projectFilePath: projectPath,
      samples,
      sources: projectCore.deriveSources(samples),
      settings: {
        activeStep: 'Analysis',
        metricKey: 'bAmplitudeUv',
        metricVersion: 'raw',
        recordFilter: 'All',
        biologicalUnit: 'subject',
        eyeAggregation: 'average-eyes',
        comparisonDesign: 'independent',
      },
    })
    assert(project.sources.length === files.length, `${name}: expected ${files.length} source files, got ${project.sources.length}`)

    fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), 'utf8')
    const restored = projectCore.normalizeProject(JSON.parse(fs.readFileSync(projectPath, 'utf8')))
    assert(restored.samples.length === project.samples.length, `${name}: project file roundtrip changed sample count`)
    assert(restored.sources.length === project.sources.length, `${name}: project file roundtrip changed source count`)
    assert(restored.settings.selectedSampleId, `${name}: project file roundtrip lost selected sample`)
    assert(restored.projectFilePath === projectPath, `${name}: project file path was not preserved`)

    const modes = unique(project.samples.map((sample) => sample.mode))
    const hasErg = project.samples.some((sample) => sourceTypeFromMode(sample.mode) === 'ERG')
    const hasFvep = project.samples.some((sample) => sourceTypeFromMode(sample.mode) === 'FVEP')
    const currentResult = assertAnalysis(name, project, 'All')
    if (hasErg) assertAnalysis(name, project, 'ERG')
    if (hasFvep) assertAnalysis(name, project, 'FVEP')

    ;['current', 'erg-preset', 'fvep-preset', 'source-appendix'].forEach((scope) => {
      const report = reportCore.buildReportPackage(project, currentResult, { reportScope: scope })
      assert(report && report.summary, `${name}: missing report summary for ${scope}`)
      assert(report.scopes && report.scopes.length === 4, `${name}: missing report scopes for ${scope}`)
      assert(report.tables && report.tables.some((table) => table.id === 'analysis_source'), `${name}: missing analysis source table for ${scope}`)
      assert(report.figures && report.figures.length > 0, `${name}: missing report figures for ${scope}`)
    })

    const report = reportCore.buildReportPackage(project, currentResult, { reportScope: 'current' })
    const sheets = exportCore.buildProjectWorkbookSheets(project, currentResult, report)
    REQUIRED_SHEETS.forEach((sheet) => {
      assert(Array.isArray(sheets[sheet]), `${name}: missing workbook sheet ${sheet}`)
      assert(sheets[sheet].length > 0, `${name}: workbook sheet ${sheet} has no header`)
    })
    assert(sheets.analysis_source.length > 1, `${name}: workbook analysis_source has no data rows`)
    assert(sheets.report_scopes.length > 1, `${name}: workbook report_scopes has no data rows`)

    const workbookPath = path.join(tempDir, `${name}-analysis.xlsx`)
    writeWorkbook(workbookPath, sheets)
    const roundtripWorkbook = XLSX.readFile(workbookPath)
    REQUIRED_SHEETS.forEach((sheet) => {
      assert(roundtripWorkbook.SheetNames.includes(sheet.slice(0, 31)), `${name}: exported XLSX missing sheet ${sheet}`)
    })
    const analysisRows = XLSX.utils.sheet_to_json(roundtripWorkbook.Sheets.analysis_source, { header: 1 })
    const scopeRows = XLSX.utils.sheet_to_json(roundtripWorkbook.Sheets.report_scopes, { header: 1 })
    assert(analysisRows.length === sheets.analysis_source.length, `${name}: exported XLSX changed analysis_source row count`)
    assert(scopeRows.length === sheets.report_scopes.length, `${name}: exported XLSX changed report_scopes row count`)

    const html = exportCore.buildReportHtml(project, currentResult, report)
    const htmlPath = path.join(tempDir, `${name}-report.html`)
    fs.writeFileSync(htmlPath, html, 'utf8')
    const restoredHtml = fs.readFileSync(htmlPath, 'utf8')
    assert(restoredHtml.includes('ERG Viewer report'), `${name}: report HTML missing report title`)
    assert(restoredHtml.includes('Publication Figure Plan'), `${name}: report HTML missing figure plan`)

    console.log(
      [
        `${name}: files=${files.length}`,
        `records=${project.samples.length}`,
        `sources=${project.sources.length}`,
        `modes=${modes.join('/')}`,
        `sourceRows=${currentResult.sourceRows.length}`,
        `figures=${report.figures.length}`,
        `sheets=${Object.keys(sheets).length}`,
        'artifacts=ep/xlsx/html',
      ].join(' | ')
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function writeWorkbook(filePath, sheets) {
  const workbook = XLSX.utils.book_new()
  Object.entries(sheets).forEach(([sheetName, rows]) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName.slice(0, 31))
  })
  XLSX.writeFile(workbook, filePath)
}

function assertAnalysis(name, project, sourceType) {
  const plan = analysisCore.buildAnalysisPlan(project, {
    sourceType,
    metricKey: sourceType === 'FVEP' ? 'p1n1AmplitudeUv' : 'bAmplitudeUv',
    metricVersion: 'raw',
  })
  const result = analysisCore.runAnalysis(project, plan)
  assert(result.sourceRows.length > 0, `${name}: ${sourceType} analysis has no source rows`)
  assert(result.snapshot && result.snapshot.usable, `${name}: ${sourceType} analysis missing snapshot`)
  assert(Array.isArray(result.warnings), `${name}: ${sourceType} analysis missing warnings array`)
  return result
}

function sourceTypeFromMode(mode) {
  return String(mode || '').toLowerCase() === 'fvep' ? 'FVEP' : 'ERG'
}

function unique(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '')).filter(Boolean))).sort()
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
