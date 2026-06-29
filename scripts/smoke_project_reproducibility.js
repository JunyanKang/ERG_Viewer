#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const XLSX = require('xlsx')

const projectCore = require('../src-v2/renderer/core/project')
const analysisCore = require('../src-v2/renderer/core/analysis')
const exportCore = require('../src-v2/renderer/core/export')
const reportCore = require('../src-v2/renderer/core/report')

function main() {
  const repoRoot = path.join(__dirname, '..')
  const filePath =
    process.argv[2] || path.join(repoRoot, 'docs', 'examples', 'demo-control-1_FERG.xlsx')
  assert(fs.existsSync(filePath), `Missing input file ${filePath}`)

  const samples = projectCore.parseWorkbookToSamples(XLSX.readFile(filePath), filePath)
  const dops = samples.find((sample) => String(sample.mode || '').toLowerCase() === 'dops')
  assert(dops, 'Demo file did not contain a dOps record')
  const rawDopsAmplitude = Number(dops.metrics.raw.sumOpAmplitudeUv)
  assert(Number.isFinite(rawDopsAmplitude), `Unexpected raw dOps OP amplitude ${dops.metrics.raw.sumOpAmplitudeUv}`)

  dops.corrections = {
    ...(dops.corrections || {}),
    manualPoints: {
      ...(dops.corrections && dops.corrections.manualPoints ? dops.corrections.manualPoints : {}),
      right: {
        ops: [{ peak: { x: 20, y: 30 }, valley: { x: 24, y: 5 } }],
      },
      left: {
        ops: [{ peak: { x: 21, y: 26 }, valley: { x: 26, y: 4 } }],
      },
    },
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erg-viewer-project-repro-'))
  try {
    const projectPath = path.join(tempDir, 'manual-dops-repro.ep')
    const project = projectCore.normalizeProject({
      title: 'Manual dOps reproducibility',
      savedAt: '2026-06-28T00:00:00.000Z',
      projectFilePath: projectPath,
      samples,
      sources: projectCore.deriveSources(samples),
      settings: {
        activeStep: 'Analysis',
        recordFilter: 'ERG',
        selectedSampleId: dops.id,
        analysisSourceType: 'ERG',
        analysisProtocolMode: 'dOps',
        analysisProtocolFamily: 'dOps',
        analysisCondition: dops.condition,
        metricKey: 'sumOpAmplitudeUv',
        metricVersion: 'manual',
        biologicalUnit: 'subject',
        eyeAggregation: 'average-eyes',
        comparisonDesign: 'independent',
      },
    })
    fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), 'utf8')

    const reopened = projectCore.normalizeProject(JSON.parse(fs.readFileSync(projectPath, 'utf8')))
    assert(reopened.projectFilePath === projectPath, 'Project file path was not preserved')
    assert(reopened.samples.length === samples.length, 'Project sample count changed after reopen')
    assert(reopened.settings.metricVersion === 'manual', 'Metric layer was not preserved')
    assert(reopened.settings.analysisProtocolMode === 'dOps', 'Analysis protocol was not preserved')
    assert(reopened.correctionLog.length === 1, `Expected one corrected sample in correctionLog, got ${reopened.correctionLog.length}`)
    assert(reopened.correctionLog[0].manualPoints === 4, `Expected 4 manual points, got ${reopened.correctionLog[0].manualPoints}`)

    const raw = runDopsAnalysis(reopened, 'raw')
    const manual = runDopsAnalysis(reopened, 'manual')
    assertValue(raw, rawDopsAmplitude, 'raw dOps analysis')
    assertValue(manual, 23.5, 'manual dOps analysis')
    assert(raw.sourceRows[0].source === 'raw', 'Raw source should be raw')
    assert(manual.sourceRows[0].source === 'manual', 'Manual source should be manual')

    const report = reportCore.buildReportPackage(reopened, manual, { reportScope: 'current' })
    const sheets = exportCore.buildProjectWorkbookSheets(reopened, manual, report)
    assertCorrectionRows(sheets.corrections_log)
    assertMetricSheet(sheets.metrics_manual, reopened.samples.find((sample) => sample.id === dops.id).id, 23.5, 'manual')
    assertMetricSheet(sheets.metrics_corrected, reopened.samples.find((sample) => sample.id === dops.id).id, 23.5, 'manual')
    assert(sheets.analysis_source.length === manual.sourceRows.length + 1, 'analysis_source row count mismatch')

    const workbookPath = path.join(tempDir, 'manual-dops-repro.xlsx')
    writeWorkbook(workbookPath, sheets)
    const workbook = XLSX.readFile(workbookPath)
    assert(workbook.SheetNames.includes('corrections_log'), 'Roundtrip workbook missing corrections_log')
    const correctionRows = XLSX.utils.sheet_to_json(workbook.Sheets.corrections_log, { header: 1 })
    assert(correctionRows.length === sheets.corrections_log.length, 'Roundtrip corrections_log row count changed')

    console.log(
      [
        'project-repro-smoke: ok',
        `records=${reopened.samples.length}`,
        `sources=${reopened.sources.length}`,
        `raw=${raw.sourceRows[0].value}`,
        `manual=${manual.sourceRows[0].value}`,
        `layer=${reopened.settings.metricVersion}`,
        `correctionRows=${sheets.corrections_log.length - 1}`,
      ].join(' | ')
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function runDopsAnalysis(project, metricVersion) {
  const plan = analysisCore.buildAnalysisPlan(project, {
    sourceType: 'ERG',
    protocolMode: 'dOps',
    condition: project.settings.analysisCondition,
    metricKey: 'sumOpAmplitudeUv',
    metricVersion,
    biologicalUnit: 'subject',
    eyeAggregation: 'average-eyes',
    comparisonDesign: 'independent',
  })
  const result = analysisCore.runAnalysis(project, plan)
  assert(result.sourceRows.length === 1, `${metricVersion}: expected one dOps source row, got ${result.sourceRows.length}`)
  return result
}

function assertValue(result, expected, label) {
  const actual = Number(result.sourceRows[0].value)
  assert(actual === expected, `${label}: expected ${expected}, got ${actual}`)
}

function assertCorrectionRows(rows) {
  assert(Array.isArray(rows) && rows.length === 5, `Expected 4 correction rows plus header, got ${rows && rows.length}`)
  ;[
    ['right', 'OP1 peak', 20, 30],
    ['right', 'OP1 valley', 24, 5],
    ['left', 'OP1 peak', 21, 26],
    ['left', 'OP1 valley', 26, 4],
  ].forEach(([eye, point, x, y]) => {
    assert(
      rows.some((row) => row[4] === eye && row[5] === point && row[6] === x && row[7] === y),
      `Missing correction row ${eye} ${point}`
    )
  })
}

function assertMetricSheet(rows, sampleId, expectedValue, expectedSource) {
  const row = rows
    .slice(1)
    .find((item) => item[0] === sampleId && item[9] === 'sumOpAmplitudeUv')
  assert(row, `Missing sumOpAmplitudeUv row for ${sampleId}`)
  assert(row[10] === expectedValue, `Expected metric value ${expectedValue}, got ${row[10]}`)
  assert(row[13] === expectedSource, `Expected metric source ${expectedSource}, got ${row[13]}`)
}

function writeWorkbook(filePath, sheets) {
  const workbook = XLSX.utils.book_new()
  Object.entries(sheets).forEach(([sheetName, rows]) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName.slice(0, 31))
  })
  XLSX.writeFile(workbook, filePath)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
