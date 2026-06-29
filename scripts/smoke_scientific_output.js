#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const projectCore = require('../src-v2/renderer/core/project')
const analysisCore = require('../src-v2/renderer/core/analysis')
const reportCore = require('../src-v2/renderer/core/report')
const exportCore = require('../src-v2/renderer/core/export')

const DEFAULT_FILES = [
  'demo-control-1_FERG.xlsx',
  'demo-cko-1_FERG.xlsx',
  'demo-control-1_FVEP.xlsx',
  'demo-cko-1_FVEP.xlsx',
]

const ERG_READY_FIGURES = [
  'erg_representative_traces',
  'erg_awave_response_curve',
  'erg_bwave_response_curve',
  'erg_implicit_time_summary',
  'erg_op_summary',
  'erg_flicker_summary',
  'source_data_appendix',
]

const FVEP_REQUIRED_FIGURES = [
  'fvep_representative_traces',
  'fvep_average_waveform',
  'fvep_amplitude_quantification',
  'fvep_latency_quantification',
  'source_data_appendix',
]

function main() {
  const repoRoot = path.join(__dirname, '..')
  const examplesDir = path.join(repoRoot, 'docs', 'examples')
  const files =
    process.argv.length > 2
      ? process.argv.slice(2).map((filePath) => path.resolve(filePath))
      : DEFAULT_FILES.map((name) => path.join(examplesDir, name))
  files.forEach((filePath) => assert(fs.existsSync(filePath), `Missing input file ${filePath}`))

  const project = buildProject(files)
  const erg = buildScenario(project, {
    name: 'ERG publication preset',
    reportScope: 'erg-preset',
    plan: { sourceType: 'ERG', protocolMode: 'All', condition: 'All', metricKey: 'bAmplitudeUv' },
  })
  assertReadyFigures(erg, ERG_READY_FIGURES)
  assertTableTraceability('ERG', erg, 10)
  assertReportHtml('ERG', erg, [
    'a-wave response curve',
    'b-wave response curve',
    'Flicker ERG summary',
    'a-wave amp response',
    'b-wave amp response',
    'OP/dOps summed amp',
    'Flicker amp summary',
    'Flicker phase summary',
  ])

  const fvepAll = buildScenario(project, {
    name: 'FVEP all-stimulus preset',
    reportScope: 'fvep-preset',
    plan: { sourceType: 'FVEP', protocolMode: 'FVEP', condition: 'All', metricKey: 'p1n1AmplitudeUv' },
  })
  assertFigureIds(fvepAll, FVEP_REQUIRED_FIGURES)
  assertFigureStatus(fvepAll, 'fvep_representative_traces', 'ready')
  assertFigureStatus(fvepAll, 'fvep_average_waveform', 'blocked')
  assertFigureStatus(fvepAll, 'fvep_amplitude_quantification', 'ready')
  assertFigureStatus(fvepAll, 'fvep_latency_quantification', 'ready')
  assertTableTraceability('FVEP all-stimulus', fvepAll, 4)
  assertReportHtml('FVEP all-stimulus', fvepAll, [
    'FVEP average waveform',
    'FVEP N/P peak-to-peak amp quantification',
    'P1-N1 amp summary',
    'P1-N2 amp summary',
    'P2-N2 amp summary',
    'N1 latency summary',
    'P1 latency summary',
    'Source Data Preview',
  ])

  const firstFvepCondition = firstCondition(project, 'FVEP')
  const fvepSingle = buildScenario(project, {
    name: 'FVEP single-stimulus waveform',
    reportScope: 'current',
    plan: {
      sourceType: 'FVEP',
      protocolMode: 'FVEP',
      condition: firstFvepCondition,
      metricKey: 'p1n1AmplitudeUv',
    },
  })
  assertFigureStatus(fvepSingle, 'fvep_average_waveform', 'ready')
  assert(fvepSingle.result.waveformSummary.status === 'ok', 'FVEP single-stimulus waveform summary is not ready')
  assertReportHtml('FVEP single-stimulus', fvepSingle, ['Rendered Figures', 'Mean +/- SEM'])

  const appendix = buildScenario(project, {
    name: 'Source appendix',
    reportScope: 'source-appendix',
    plan: { sourceType: 'All', protocolMode: 'All', condition: 'All', metricKey: 'bAmplitudeUv' },
  })
  assertFigureIds(appendix, ['source_data_appendix'])
  assertFigureStatus(appendix, 'source_data_appendix', 'ready')
  assertTableTraceability('Source appendix', appendix, 14)

  const sheets = exportCore.buildProjectWorkbookSheets(project, erg.result, erg.report)
  assertWorkbookSheets(sheets)

  console.log(
    [
      'scientific-output-smoke: ok',
      `records=${project.samples.length}`,
      `sources=${project.sources.length}`,
      `ergFigures=${readyCount(erg.report.figures)}/${erg.report.figures.length}`,
      `fvepFigures=${readyCount(fvepAll.report.figures)}/${fvepAll.report.figures.length}`,
      `fvepSingleWaveform=${fvepSingle.result.waveformSummary.status}`,
      `sheets=${Object.keys(sheets).length}`,
    ].join(' | ')
  )
}

function buildProject(files) {
  const samples = files.flatMap((filePath) => projectCore.parseWorkbookToSamples(XLSX.readFile(filePath), filePath))
  assert(samples.length === 54, `Expected 54 demo records, got ${samples.length}`)
  const project = projectCore.normalizeProject({
    title: 'QA scientific output batch',
    savedAt: '2026-06-28T00:00:00.000Z',
    projectFilePath: path.join(process.cwd(), 'qa-scientific-output.ep'),
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
  assert(project.sources.length === files.length, `Expected ${files.length} sources, got ${project.sources.length}`)
  return project
}

function buildScenario(project, scenario) {
  const plan = analysisCore.buildAnalysisPlan(project, {
    ...scenario.plan,
    metricVersion: 'raw',
    biologicalUnit: 'subject',
    eyeAggregation: 'average-eyes',
    comparisonDesign: 'independent',
  })
  const result = analysisCore.runAnalysis(project, plan)
  const report = reportCore.buildReportPackage(project, result, { reportScope: scenario.reportScope })
  const html = exportCore.buildReportHtml(project, result, report)
  assert(result.sourceRows.length > 0, `${scenario.name}: expected source rows`)
  assert(report.scopes.length === 4, `${scenario.name}: expected four report scopes`)
  assert(!report.readiness.some((row) => row.status === 'error'), `${scenario.name}: readiness has error`)
  return { scenario, plan, result, report, html }
}

function assertReadyFigures(scenario, expectedIds) {
  assertFigureIds(scenario, expectedIds)
  expectedIds.forEach((id) => assertFigureStatus(scenario, id, 'ready'))
}

function assertFigureIds(scenario, expectedIds) {
  const ids = scenario.report.figures.map((figure) => figure.id)
  expectedIds.forEach((id) => assert(ids.includes(id), `${scenario.scenario.name}: missing figure ${id}`))
}

function assertFigureStatus(scenario, id, status) {
  const figure = scenario.report.figures.find((row) => row.id === id)
  assert(figure, `${scenario.scenario.name}: missing figure ${id}`)
  assert(figure.status === status, `${scenario.scenario.name}: expected ${id} ${status}, got ${figure.status}`)
}

function assertTableTraceability(name, scenario, minRows) {
  const sourceTable = scenario.report.tables.find((table) => table.id === 'analysis_source')
  assert(sourceTable, `${name}: missing analysis_source report table`)
  assert(sourceTable.rows >= minRows, `${name}: expected at least ${minRows} source rows, got ${sourceTable.rows}`)
  assert(scenario.result.sourceRows.length >= minRows, `${name}: result sourceRows below expected`)
  const sourceRows = scenario.result.sourceRows
  assert(sourceRows.every((row) => row.sampleId), `${name}: source rows missing sample id`)
  assert(sourceRows.every((row) => row.metric), `${name}: source rows missing metric`)
  assert(sourceRows.every((row) => Object.prototype.hasOwnProperty.call(row, 'included')), `${name}: source rows missing included flag`)
}

function assertReportHtml(name, scenario, fragments) {
  fragments.forEach((fragment) => {
    assert(scenario.html.includes(fragment), `${name}: report HTML missing ${fragment}`)
  })
  assert(scenario.html.includes('Publication Figure Plan'), `${name}: report HTML missing figure plan`)
  assert(scenario.html.includes('Source Data Preview'), `${name}: report HTML missing source data preview`)
  assert(!scenario.html.includes('No reportable figure'), `${name}: report HTML fell back to no figure`)
}

function assertWorkbookSheets(sheets) {
  ;['analysis_source', 'report_figures', 'report_scopes', 'report_readiness', 'figure_source'].forEach((sheet) => {
    assert(Array.isArray(sheets[sheet]) && sheets[sheet].length > 1, `Workbook sheet ${sheet} has no data rows`)
  })
  const figureHeader = sheets.report_figures[0]
  ;['id', 'title', 'kind', 'status', 'detail'].forEach((field) => {
    assert(figureHeader.includes(field), `report_figures missing ${field} column`)
  })
  const sourceHeader = sheets.analysis_source[0]
  ;['sample_id', 'subject_id', 'group', 'included', 'mode', 'stimulus', 'metric', 'version', 'value'].forEach((field) => {
    assert(sourceHeader.includes(field), `analysis_source missing ${field} column`)
  })
}

function firstCondition(project, sourceType) {
  const sample = project.samples.find((row) => sourceTypeFromMode(row.mode) === sourceType && row.condition)
  assert(sample, `No ${sourceType} stimulus found`)
  return sample.condition
}

function sourceTypeFromMode(mode) {
  return String(mode || '').toLowerCase() === 'fvep' ? 'FVEP' : 'ERG'
}

function readyCount(figures) {
  return figures.filter((figure) => figure.status === 'ready').length
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
