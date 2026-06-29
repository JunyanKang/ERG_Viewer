const analysis = require('../analysis')
const report = require('../report')
const projectCore = require('../project')
const XLSX = require('xlsx')

function sample(overrides) {
  return {
    id: overrides.id,
    subjectId: overrides.subjectId || overrides.id,
    acquisitionId: overrides.acquisitionId || '01',
    pairedId: overrides.pairedId,
    label: overrides.label || overrides.id,
    cohort: overrides.cohort,
    mode: overrides.mode,
    condition: overrides.condition,
    sourceName: overrides.sourceName || `${overrides.id}.xlsx`,
    included: overrides.included !== false,
    traces: { right: { x: [0, 1], y: [0, 1] }, left: { x: [0, 1], y: [0, 1] } },
    metrics: {
      raw: {
        amplitudeUv: overrides.amplitudeUv,
        p1n1AmplitudeUv: overrides.p1n1AmplitudeUv ?? overrides.amplitudeUv,
      },
    },
    corrections: {},
    qc: [{ level: 'ok', message: 'ready' }],
  }
}

describe('ERG Viewer v2 report package', () => {
  test('builds a report manifest from stimulus-aware FVEP analysis', () => {
    const project = projectCore.normalizeProject({
      title: 'FVEP report',
      samples: [
        sample({ id: 'ctrl-1', cohort: 'control', mode: 'FVEP', condition: '0.5 cd', amplitudeUv: 8 }),
        sample({ id: 'ctrl-2', cohort: 'control', mode: 'FVEP', condition: '3.0 cd', amplitudeUv: 9 }),
        sample({ id: 'cko-1', cohort: 'cko', mode: 'FVEP', condition: '0.5 cd', amplitudeUv: 4 }),
        sample({ id: 'cko-2', cohort: 'cko', mode: 'FVEP', condition: '3.0 cd', amplitudeUv: 5 }),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'FVEP',
      protocolMode: 'FVEP',
      condition: 'All',
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
    })
    const pkg = report.buildReportPackage(project, result)

    expect(pkg.summary.records).toBe(4)
    expect(pkg.figures).toContainEqual(
      expect.objectContaining({ id: 'fvep_amplitude_quantification', kind: 'response-curve' })
    )
    expect(pkg.tables.find((table) => table.id === 'analysis_source').rows).toBe(4)
    expect(pkg.tables.find((table) => table.id === 'analysis_source').previewRows[0]).toMatchObject({
      subject: 'ctrl-1',
      cohort: 'control',
      included: true,
      value: 8,
    })
    expect(pkg.readiness.map((row) => row.status)).toContain('warn')
    expect(pkg.exportManifest).toMatchObject({ sourceType: 'FVEP', protocol: 'FVEP', stimulus: 'All' })
    expect(pkg.scopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'current', active: true }),
        expect.objectContaining({ id: 'erg-preset' }),
        expect.objectContaining({ id: 'fvep-preset' }),
        expect.objectContaining({ id: 'source-appendix' }),
      ])
    )
  })

  test('reports FVEP average waveform when one condition is selected', () => {
    const project = projectCore.normalizeProject({
      title: 'FVEP waveform report',
      savedAt: '2026-06-28T00:00:00.000Z',
      samples: [
        sample({ id: 'ctrl-1', cohort: 'control', mode: 'FVEP', condition: '0.5 cd', amplitudeUv: 8 }),
        sample({ id: 'ctrl-2', cohort: 'control', mode: 'FVEP', condition: '0.5 cd', amplitudeUv: 9 }),
        sample({ id: 'cko-1', cohort: 'cko', mode: 'FVEP', condition: '0.5 cd', amplitudeUv: 4 }),
        sample({ id: 'cko-2', cohort: 'cko', mode: 'FVEP', condition: '0.5 cd', amplitudeUv: 5 }),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'FVEP',
      protocolMode: 'FVEP',
      condition: '0.5 cd',
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
    })
    const pkg = report.buildReportPackage(project, result)

    expect(pkg.figures).toContainEqual(expect.objectContaining({ id: 'fvep_average_waveform' }))
    expect(pkg.readiness[0]).toEqual({ label: 'Project file saved', status: 'ok' })
    expect(pkg.summary.figures).toBeGreaterThanOrEqual(1)
  })

  test('plans publication FVEP panels from the root demo template', () => {
    const file = 'demo/FVEP_demo.xls'
    const records = projectCore.parseWorkbookToSamples(XLSX.readFile(file), file)
    const project = projectCore.normalizeProject({
      title: 'Root FVEP demo template',
      savedAt: '2026-06-28T00:00:00.000Z',
      samples: records,
    })
    const condition = project.samples[0].condition
    const result = analysis.runAnalysis(project, {
      sourceType: 'FVEP',
      protocolMode: 'FVEP',
      condition,
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
    })
    const pkg = report.buildReportPackage(project, result)
    const figures = new Map(pkg.figures.map((figure) => [figure.id, figure]))

    expect(project.samples.length).toBe(2)
    expect(figures.get('fvep_representative_traces')).toMatchObject({ status: 'ready' })
    expect(figures.get('fvep_average_waveform')).toBeTruthy()
    expect(figures.get('fvep_amplitude_quantification')).toMatchObject({ status: 'ready' })
    expect(figures.get('fvep_latency_quantification')).toBeTruthy()
    expect(figures.get('source_data_appendix')).toMatchObject({ status: 'ready' })
  })

  test('plans publication ERG panels from the root demo template', () => {
    const file = 'demo/ERG_demo.xlsx'
    const records = projectCore.parseWorkbookToSamples(XLSX.readFile(file), file)
    const project = projectCore.normalizeProject({
      title: 'Root ERG demo template',
      savedAt: '2026-06-28T00:00:00.000Z',
      samples: records,
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'ERG',
      protocolMode: 'All',
      condition: 'All',
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
      statsPolicy: 'descriptive-only',
    })
    const pkg = report.buildReportPackage(project, result)
    const figures = new Map(pkg.figures.map((figure) => [figure.id, figure]))

    expect(project.samples.length).toBe(19)
    expect(figures.get('erg_representative_traces')).toMatchObject({ status: 'ready' })
    expect(figures.get('erg_awave_response_curve')).toBeTruthy()
    expect(figures.get('erg_bwave_response_curve')).toBeTruthy()
    expect(figures.get('erg_op_summary')).toMatchObject({ status: 'ready' })
    expect(figures.get('erg_flicker_summary')).toMatchObject({ status: 'ready' })
    expect(figures.get('source_data_appendix')).toMatchObject({ status: 'ready' })
  })

  test('marks the selected report scope for reproducible report exports', () => {
    const project = projectCore.normalizeProject({
      title: 'Scoped report',
      savedAt: '2026-06-28T00:00:00.000Z',
      samples: [
        sample({ id: 'erg-1', cohort: 'control', mode: 'FERG', condition: 'dMax', amplitudeUv: 12 }),
        sample({ id: 'fvep-1', cohort: 'control', mode: 'FVEP', condition: '0.5 cd', amplitudeUv: 4 }),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'ERG',
      protocolMode: 'All',
      condition: 'All',
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
      statsPolicy: 'descriptive-only',
    })
    const pkg = report.buildReportPackage(project, result, { reportScope: 'erg-preset' })

    expect(pkg.reportScope).toBe('erg-preset')
    expect(pkg.scopes.find((scope) => scope.id === 'erg-preset')).toMatchObject({
      active: true,
      records: 1,
    })
    expect(pkg.scopes.find((scope) => scope.id === 'fvep-preset')).toMatchObject({ records: 1 })
  })

  test('surfaces paired-design readiness notes in report package', () => {
    const project = projectCore.normalizeProject({
      title: 'Paired FVEP readiness',
      savedAt: '2026-06-28T00:00:00.000Z',
      settings: { comparisonDesign: 'paired' },
      samples: [
        sample({
          id: 'baseline-1',
          subjectId: 'mouse-1',
          pairedId: 'mouse-1',
          cohort: 'Baseline',
          mode: 'FVEP',
          condition: '3.0 cd',
          amplitudeUv: 8,
        }),
        sample({
          id: 'treated-1',
          subjectId: 'mouse-1',
          pairedId: 'mouse-1',
          cohort: 'Treated',
          mode: 'FVEP',
          condition: '3.0 cd',
          amplitudeUv: 10,
        }),
        sample({
          id: 'baseline-2',
          subjectId: 'mouse-2',
          pairedId: 'mouse-2',
          cohort: 'Baseline',
          mode: 'FVEP',
          condition: '3.0 cd',
          amplitudeUv: 7,
        }),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'FVEP',
      protocolMode: 'FVEP',
      condition: '3.0 cd',
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
    })
    const pkg = report.buildReportPackage(project, result)
    const readinessLabels = pkg.readiness.map((row) => row.label)

    expect(readinessLabels).toContain('Paired design is descriptive-only in this build')
    expect(readinessLabels).toContain('1 paired-ID readiness warning')
    expect(pkg.readiness.find((row) => row.label === '1 paired-ID readiness warning')).toMatchObject({
      status: 'warn',
    })
    expect(pkg.tables.find((table) => table.id === 'paired_readiness')).toMatchObject({
      title: 'Paired-ID readiness details',
      rows: 1,
    })
    expect(pkg.tables.find((table) => table.id === 'paired_readiness').previewRows[0]).toMatchObject({
      issue: 'paired-id-incomplete',
      condition: '3.0 cd',
      pairedId: 'mouse-2',
      sampleIds: 'baseline-2',
    })
  })
})
