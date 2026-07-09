#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const XLSX = require('xlsx')

const DEFAULT_APP = '/Applications/OptoERGViewer.app/Contents/MacOS/OptoERGViewer'
const projectCore = require('../src-v2/renderer/core/project')
const analysisCore = require('../src-v2/renderer/core/analysis')
const reportCore = require('../src-v2/renderer/core/report')

const REPORT_DIR = path.join(
  __dirname,
  '..',
  'docs',
  'qa',
  '2026-06-28-global-redesign-round-66-installed-input-mode-matrix'
)
const REPORT_PATH = path.join(REPORT_DIR, 'INSTALLED_INPUT_MODE_MATRIX.md')

async function main() {
  const repoRoot = path.join(__dirname, '..')
  const appPath = process.env.ERG_VIEWER_INSTALLED_APP || DEFAULT_APP
  const examplesDir = path.join(repoRoot, 'test-fixtures', 'opto')
  assert(fs.existsSync(appPath), `Installed app executable not found: ${appPath}`)
  const scenarios = scenarioDefinitions(examplesDir)

  const rows = []
  for (const scenario of scenarios) {
    scenario.files.forEach((filePath) => assert(fs.existsSync(filePath), `${scenario.name}: missing input ${filePath}`))
    const expected = expectedFromCore(scenario)
    const installed = await collectInstalledSnapshot(appPath, scenario, expected)
    rows.push(assertScenario(scenario, expected, installed))
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(REPORT_PATH, buildMarkdownReport(rows, appPath), 'utf8')
  console.log(
    [
      'installed-input-mode-matrix-smoke: ok',
      `scenarios=${rows.length}`,
      `records=${rows.map((row) => `${row.name}:${row.records}`).join(',')}`,
      `sources=${rows.map((row) => `${row.name}:${row.sources}`).join(',')}`,
      `report=${path.relative(repoRoot, REPORT_PATH)}`,
    ].join(' | ')
  )
}

function scenarioDefinitions(examplesDir) {
  const file = (name) => path.join(examplesDir, name)
  return [
    {
      name: 'single-erg',
      label: 'Single ERG file',
      files: [file('demo-control-1_FERG.xlsx')],
      expectedTypes: ['ERG'],
      qaSelectMode: 'ERG',
    },
    {
      name: 'multi-erg',
      label: 'Multiple ERG files',
      files: [
        file('demo-control-1_FERG.xlsx'),
        file('demo-cko-1_FERG.xlsx'),
        file('demo-control-2_FERG.xlsx'),
        file('demo-cko-2_FERG.xlsx'),
      ],
      expectedTypes: ['ERG'],
      qaSelectMode: 'ERG',
    },
    {
      name: 'single-fvep',
      label: 'Single FVEP file',
      files: [file('demo-control-1_FVEP.xlsx')],
      expectedTypes: ['FVEP'],
      qaSelectMode: 'FVEP',
    },
    {
      name: 'multi-fvep',
      label: 'Multiple FVEP files',
      files: [
        file('demo-control-1_FVEP.xlsx'),
        file('demo-cko-1_FVEP.xlsx'),
        file('demo-control-2_FVEP.xlsx'),
        file('demo-cko-2_FVEP.xlsx'),
      ],
      expectedTypes: ['FVEP'],
      qaSelectMode: 'FVEP',
    },
    {
      name: 'mixed-erg-fvep',
      label: 'Mixed ERG and FVEP files',
      files: [
        file('demo-control-1_FERG.xlsx'),
        file('demo-cko-1_FERG.xlsx'),
        file('demo-control-1_FVEP.xlsx'),
        file('demo-cko-1_FVEP.xlsx'),
      ],
      expectedTypes: ['ERG', 'FVEP'],
      qaSelectMode: 'ERG',
    },
  ]
}

function expectedFromCore(scenario) {
  const samples = scenario.files.flatMap((filePath) => projectCore.parseWorkbookToSamples(XLSX.readFile(filePath), filePath))
  assert(samples.length > 0, `${scenario.name}: core parser returned no records`)
  const sources = projectCore.deriveSources(samples)
  assert(sources.length === scenario.files.length, `${scenario.name}: source count mismatch in core parser`)
  const project = projectCore.normalizeProject({
    title: scenario.label,
    samples,
    sources,
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
  const sourceTypes = unique(samples.map((sample) => projectCore.sourceTypeFromMode(sample.mode)))
  scenario.expectedTypes.forEach((type) => assert(sourceTypes.includes(type), `${scenario.name}: missing ${type} records`))
  assert(
    sourceTypes.every((type) => scenario.expectedTypes.includes(type)),
    `${scenario.name}: unexpected source type ${sourceTypes.join(',')}`
  )
  const sourceRows = []
  sourceTypes.forEach((sourceType) => {
    const result = analysisCore.runAnalysis(
      project,
      analysisCore.buildAnalysisPlan(project, { sourceType, metricKey: metricForSourceType(sourceType), metricVersion: 'raw' })
    )
    assert(result.sourceRows.length > 0, `${scenario.name}: no ${sourceType} source rows`)
    sourceRows.push(...result.sourceRows)
  })
  const current = analysisCore.runAnalysis(
    project,
    analysisCore.buildAnalysisPlan(project, { sourceType: 'All', metricKey: 'bAmplitudeUv', metricVersion: 'raw' })
  )
  const report = reportCore.buildReportPackage(project, current, { reportScope: 'current' })
  assert(report.scopes && report.scopes.length === 4, `${scenario.name}: core report scopes missing`)
  return {
    records: samples.length,
    sources: sources.length,
    sourceTypes,
    sourceRows: sourceRows.length,
    reportScopes: report.scopes.length,
  }
}

function metricForSourceType(sourceType) {
  return sourceType === 'FVEP' ? 'p1n1AmplitudeUv' : 'bAmplitudeUv'
}

async function collectInstalledSnapshot(appPath, scenario, expected) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), `erg-viewer-input-mode-${scenario.name}-`))
  try {
    await runInstalledApp(appPath, scenario.files, {
      ERG_VIEWER_QA_ACTIVE_STEP: 'Report',
      ERG_VIEWER_QA_STATE_DIR: stateDir,
      ERG_VIEWER_QA_EXPECTED_SOURCES: String(expected.sources),
      ERG_VIEWER_QA_EXPECTED_SOURCE_NAMES: scenario.files.map((filePath) => path.basename(filePath)).join('|'),
      ERG_VIEWER_QA_SELECT_MODE: scenario.qaSelectMode,
    })
    const stateFile = path.join(stateDir, 'report-state.json')
    assert(fs.existsSync(stateFile), `${scenario.name}: installed report state was not written`)
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true })
  }
}

function runInstalledApp(appPath, files, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(appPath, files, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Installed input matrix timed out\n${stdout}\n${stderr}`))
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
      else reject(new Error(`Installed app exited with ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function assertScenario(scenario, expected, installed) {
  assert(installed.records === expected.records, `${scenario.name}: installed records ${installed.records} != ${expected.records}`)
  assert(installed.sources === expected.sources, `${scenario.name}: installed sources ${installed.sources} != ${expected.sources}`)
  assert(installed.reportSourceRows > 0, `${scenario.name}: installed report rows missing`)
  assert(Array.isArray(installed.reportScopes) && installed.reportScopes.length === 4, `${scenario.name}: installed report scopes missing`)
  assert(installed.gates && installed.gates.canExportPdf, `${scenario.name}: installed PDF export gate disabled`)
  assert(installed.gates && installed.gates.canExportWorkbook, `${scenario.name}: installed workbook export gate disabled`)
  assert(installed.layout && Array.isArray(installed.layout.issues) && installed.layout.issues.length === 0, `${scenario.name}: layout issues`)
  return {
    name: scenario.name,
    label: scenario.label,
    files: scenario.files.length,
    records: installed.records,
    sources: installed.sources,
    types: expected.sourceTypes,
    coreSourceRows: expected.sourceRows,
    installedReportRows: installed.reportSourceRows,
    reportScopes: installed.reportScopes.length,
    canExportPdf: Boolean(installed.gates && installed.gates.canExportPdf),
    canExportWorkbook: Boolean(installed.gates && installed.gates.canExportWorkbook),
  }
}

function buildMarkdownReport(rows, appPath) {
  const lines = [
    '# Round 66 - Installed Input Mode Matrix',
    '',
    'Date: 2026-06-28',
    '',
    'This non-screenshot matrix verifies the installed macOS app against the input modes explicitly required by the product workflow: single ERG, multiple ERG, single FVEP, multiple FVEP, and mixed ERG/FVEP import.',
    '',
    `Installed executable: ${appPath}`,
    '',
    '| Scenario | Files | Records | Sources | Source Types | Core Source Rows | Installed Report Rows | Report Scopes | Export Gates | Result |',
    '| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- |',
  ]
  rows.forEach((row) => {
    lines.push(
      `| ${row.label} | ${row.files} | ${row.records} | ${row.sources} | ${row.types.join(', ')} | ${row.coreSourceRows} | ${row.installedReportRows} | ${row.reportScopes} | PDF=${row.canExportPdf}; XLSX=${row.canExportWorkbook} | Pass |`
    )
  })
  lines.push(
    '',
    '## Verdict',
    '',
    'All installed import scenarios parsed records, preserved one source per selected workbook, exposed report scopes, and enabled PDF/XLSX export gates. Screenshot and Computer Use review remains paused.'
  )
  return `${lines.join('\n')}\n`
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean))).sort()
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error))
  process.exit(1)
})
