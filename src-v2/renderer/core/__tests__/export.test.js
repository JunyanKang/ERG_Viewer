const projectCore = require('../project')
const exportCore = require('../export')
const analysis = require('../analysis')
const report = require('../report')
const demo = require('../demo-data')

describe('OptoERGViewer v2 project workbook export', () => {
  test('builds reproducible workbook sheets with raw, manual and correction provenance', () => {
    const project = projectCore.normalizeProject(demo.createDemoProject())
    project.samples[0].corrections.manualPoints.right.a = { x: 30, y: -80 }
    project.samples[0].corrections.manualPoints.right.b = { x: 75, y: 170 }
    const normalized = projectCore.normalizeProject(project)
    const result = analysis.runAnalysis(normalized, {
      sourceType: 'ERG',
      protocolMode: 'FERG',
      condition: 'All',
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
    })
    const reportPackage = report.buildReportPackage(normalized, result)
    const sheets = exportCore.buildProjectWorkbookSheets(normalized, result, reportPackage)

    expect(Object.keys(sheets)).toEqual(
      expect.arrayContaining([
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
      ])
    )
    expect(sheets.samples.length).toBe(normalized.samples.length + 1)
    expect(sheets.samples[0]).toEqual(
      expect.arrayContaining(['paired_id', 'inferred_group', 'group_source', 'inferred_paired_id'])
    )
    expect(sheets.groups[0]).toEqual(['sample_id', 'subject_id', 'analysis_group', 'paired_id', 'included'])
    expect(sheets.metrics_raw.length).toBeGreaterThan(normalized.samples.length)
    expect(sheets.metrics_corrected.length).toBeGreaterThan(normalized.samples.length)
    expect(sheets.corrections_log).toContainEqual([
      normalized.samples[0].id,
      normalized.samples[0].subjectId,
      normalized.samples[0].acquisitionId,
      normalized.samples[0].mode,
      'right',
      'b',
      75,
      170,
    ])

    const manualRows = sheets.metrics_manual.slice(1)
    expect(manualRows.every((row) => row[0] === normalized.samples[0].id)).toBe(true)
    const manualBWave = manualRows.find(
      (row) => row[0] === normalized.samples[0].id && row[9] === 'bAmplitudeUv'
    )
    expect(manualBWave[10]).toBe(250)
    expect(manualBWave[12]).toBe('manual')
    expect(manualBWave[13]).toBe('manual')
    const correctedRows = sheets.metrics_corrected.slice(1)
    expect(correctedRows.every((row) => row[12] === 'corrected')).toBe(true)
    const correctedBWave = correctedRows.find(
      (row) => row[0] === normalized.samples[0].id && row[9] === 'bAmplitudeUv'
    )
    expect(correctedBWave[10]).toBe(250)
    expect(correctedBWave[13]).toBe('manual')
    const fallbackCorrected = correctedRows.find((row) => row[0] === normalized.samples[1].id)
    expect(fallbackCorrected[13]).toBe('raw-fallback')
    expect(sheets.group_summary.some((row) => row.includes('bAmplitudeUv'))).toBe(true)
    expect(sheets.stimulus_summary[0]).toEqual(expect.arrayContaining(['stimulus', 'group']))
    expect(sheets.sources[0]).toEqual(['name', 'path', 'source_type', 'modes', 'records', 'imported_at'])
    expect(sheets.sources.slice(1).every((row) => row[2] === 'ERG' || row[2] === 'FVEP')).toBe(true)
    expect(sheets.statistical_design).toContainEqual(['biologicalUnit', 'subject', 'Subject/animal'])
    expect(sheets.analysis_plan).toContainEqual(['metricKey', 'bAmplitudeUv'])
    expect(sheets.analysis_plan).toContainEqual(['protocolFamily', 'All'])
    expect(sheets.analysis_plan).toContainEqual(['stimulus', 'All'])
    expect(sheets.analysis_plan).toContainEqual(['grouping', 'group'])
    expect(sheets.analysis_plan).toContainEqual(['eyeAggregation', 'average-eyes'])
    expect(sheets.analysis_source.length).toBe(result.sourceRows.length + 1)
    expect(sheets.analysis_source[0]).toEqual(
      expect.arrayContaining([
        'paired_id',
        'stimulus_short',
        'protocol_family',
        'stimulus_value',
        'eye_aggregation',
      ])
    )
    expect(sheets.paired_readiness[0]).toEqual([
      'issue',
      'level',
      'stimulus',
      'group',
      'paired_id',
      'sample_ids',
      'message',
    ])
    expect(sheets.report_figures[0]).toEqual(['id', 'title', 'kind', 'status', 'detail'])
    expect(sheets.report_figures.length).toBe(reportPackage.figures.length + 1)
    expect(sheets.report_scopes[0]).toEqual([
      'id',
      'title',
      'active',
      'records',
      'ready_figures',
      'total_figures',
      'blocked_figures',
      'detail',
    ])
    expect(sheets.report_scopes).toContainEqual(expect.arrayContaining(['current', 'Current analysis', true]))
    expect(sheets.report_readiness.length).toBe(reportPackage.readiness.length + 1)
  })

  test('exports dOps manual peak and valley provenance and corrected OP amplitude', () => {
    const project = projectCore.normalizeProject({
      title: 'dOps export',
      samples: [
        {
          id: 'dops-1',
          subjectId: 'Mouse-01',
          acquisitionId: '03',
          label: 'Mouse-01 dOps',
          cohort: 'Control',
          mode: 'dOps',
          condition: 'FERG(3)_dOps',
          sourceName: 'demo.xlsx',
          included: true,
          traces: { right: { x: [0, 1], y: [0, 1] }, left: { x: [0, 1], y: [0, 1] } },
          metrics: { raw: { sumOpAmplitudeUv: 50, amplitudeUv: 50 } },
          corrections: {
            manualPoints: {
              right: {
                ops: [
                  { peak: { x: 20, y: 16 }, valley: { x: 24, y: 5 } },
                  { peak: { x: 30, y: 18 }, valley: { x: 35, y: 7 } },
                ],
              },
              left: {
                ops: [{ peak: { x: 21, y: 14 }, valley: { x: 26, y: 4 } }],
              },
            },
          },
        },
      ],
    })
    const sheets = exportCore.buildProjectWorkbookSheets(project)

    expect(sheets.corrections_log).toContainEqual([
      'dops-1',
      'Mouse-01',
      '03',
      'dOps',
      'right',
      'OP1 peak',
      20,
      16,
    ])
    expect(sheets.corrections_log).toContainEqual([
      'dops-1',
      'Mouse-01',
      '03',
      'dOps',
      'right',
      'OP1 valley',
      24,
      5,
    ])
    const manualOp = sheets.metrics_manual
      .slice(1)
      .find((row) => row[0] === 'dops-1' && row[9] === 'sumOpAmplitudeUv')
    expect(manualOp[10]).toBe(16)
    expect(manualOp[12]).toBe('manual')
    const correctedOp = sheets.metrics_corrected
      .slice(1)
      .find((row) => row[0] === 'dops-1' && row[9] === 'sumOpAmplitudeUv')
    expect(correctedOp[10]).toBe(16)
    expect(correctedOp[12]).toBe('corrected')
    expect(correctedOp[13]).toBe('manual')
  })

  test('builds escaped report HTML with figures, statistics and source preview', () => {
    const sample = (id, cohort, value) => ({
      id,
      subjectId: id,
      acquisitionId: '01',
      label: id,
      cohort,
      mode: 'FVEP',
      condition: '0.5 cd',
      sourceName: `${id}.xlsx`,
      included: true,
      traces: {
        right: { x: [0, 10, 20, 30], y: [0, value / 2, value, value / 3] },
        left: { x: [0, 10, 20, 30], y: [0, value / 3, value * 0.9, value / 4] },
      },
      metrics: { raw: { amplitudeUv: value, p1n1AmplitudeUv: value } },
      corrections: {},
      qc: [{ level: 'ok', message: 'ready' }],
    })
    const project = projectCore.normalizeProject({
      title: 'FVEP <script>alert(1)</script>',
      savedAt: '2026-06-28T00:00:00.000Z',
      samples: [
        sample('ctrl-1', 'control', 8),
        sample('ctrl-2', 'control', 9),
        sample('cko-1', 'cko', 4),
        sample('cko-2', 'cko', 5),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'FVEP',
      protocolMode: 'FVEP',
      condition: '0.5 cd',
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
    })
    const reportPackage = report.buildReportPackage(project, result)
    const html = exportCore.buildReportHtml(project, result, reportPackage)

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('Publication Figure Plan')
    expect(html).toContain('Report Scope')
    expect(html).toContain('Representative FVEP traces')
    expect(html).toContain('FVEP average waveform')
    expect(html).toContain('<svg')
    expect(html).toContain('Welch t-test')
    expect(html).toContain('Source Data Preview')
    expect(html).toContain('ctrl-1')
  })

  test('segments condition-response report curves by ERG protocol family', () => {
    const ergSample = (id, condition, value) => ({
      id,
      subjectId: id,
      acquisitionId: id,
      label: id,
      cohort: 'control',
      mode: 'FERG',
      condition,
      sourceName: `${id}.xlsx`,
      included: true,
      traces: {
        right: { x: [0, 10], y: [0, value] },
        left: { x: [0, 10], y: [0, value] },
      },
      metrics: { raw: { amplitudeUv: value, aAmplitudeUv: value / 2, bAmplitudeUv: value } },
      corrections: {},
      qc: [{ level: 'ok', message: 'ready' }],
    })
    const project = projectCore.normalizeProject({
      title: 'ERG family split',
      samples: [
        ergSample('erg-1', 'FERG(1)_dRod · b白色光:3.0cd.m-2,4ms', 10),
        ergSample('erg-2', 'FERG(2)_dMax · b白色光:20.0cd.m-2,5ms', 20),
        ergSample('erg-3', 'FERG(3)_lCone · f白色光:600.0cd.m-2,5ms', 30),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'ERG',
      protocolMode: 'FERG',
      condition: 'All',
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
    })
    const reportPackage = report.buildReportPackage(project, result)
    const html = exportCore.buildReportHtml(project, result, reportPackage)

    expect(html).toContain('data-family="dRod"')
    expect(html).toContain('data-family="dMax"')
    expect(html).toContain('data-family="lCone"')
  })

  test('renders ERG preset publication panels for named endpoints', () => {
    const ergSample = (id, cohort, mode, condition, raw) => ({
      id,
      subjectId: id,
      acquisitionId: id,
      label: id,
      cohort,
      mode,
      condition,
      sourceName: `${id}.xlsx`,
      included: true,
      traces: {
        right: { x: [0, 10], y: [0, Number(raw.amplitudeUv || raw.bAmplitudeUv || 1)] },
        left: { x: [0, 10], y: [0, Number(raw.amplitudeUv || raw.bAmplitudeUv || 1)] },
      },
      metrics: { raw },
      corrections: {},
      qc: [{ level: 'ok', message: 'ready' }],
    })
    const project = projectCore.normalizeProject({
      title: 'ERG publication preset panels',
      savedAt: '2026-06-28T00:00:00.000Z',
      samples: [
        ergSample('ctrl-ferg', 'control', 'FERG', 'FERG(2)_dMax · b白色光:20.0cd.m-2,5ms', {
          amplitudeUv: 120,
          aAmplitudeUv: -40,
          bAmplitudeUv: 120,
        }),
        ergSample('cko-ferg', 'cko', 'FERG', 'FERG(2)_dMax · b白色光:20.0cd.m-2,5ms', {
          amplitudeUv: 80,
          aAmplitudeUv: -30,
          bAmplitudeUv: 80,
        }),
        ergSample('ctrl-ops', 'control', 'dOps', 'FERG(3)_dOps · b白色光:20.0cd.m-2,5ms', {
          amplitudeUv: 55,
          sumOpAmplitudeUv: 55,
        }),
        ergSample('cko-ops', 'cko', 'dOps', 'FERG(3)_dOps · b白色光:20.0cd.m-2,5ms', {
          amplitudeUv: 31,
          sumOpAmplitudeUv: 31,
        }),
        ergSample('ctrl-flicker', 'control', 'Flicker', 'FERG(5)_Flicker · 白色光: 1.00 cd·s/m² (539.2 ms)', {
          amplitudeUv: 51.4,
          flickerAmplitudeUv: 51.4,
          flickerPhaseDeg: 33.35,
        }),
        ergSample('cko-flicker', 'cko', 'Flicker', 'FERG(5)_Flicker · 白色光: 5.00 cd·s/m² (528.5 ms)', {
          amplitudeUv: 22.5,
          flickerAmplitudeUv: 22.5,
          flickerPhaseDeg: 47.8,
        }),
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
    const reportPackage = report.buildReportPackage(project, result, { reportScope: 'erg-preset' })
    const html = exportCore.buildReportHtml(project, result, reportPackage)

    expect(html).toContain('a-wave amp response')
    expect(html).toContain('b-wave amp response')
    expect(html).toContain('OP/dOps summed amp')
    expect(html).toContain('Flicker amp summary')
    expect(html).toContain('Flicker phase summary')
    expect(html).toContain('A-wave amp (µV)')
    expect(html).toContain('Flicker phase (deg)')
  })

  test('renders FVEP preset publication panels for N/P amplitude and latency endpoints', () => {
    const fvepSample = (id, cohort, condition, raw) => ({
      id,
      subjectId: id,
      acquisitionId: id,
      label: id,
      cohort,
      mode: 'FVEP',
      condition,
      sourceName: `${id}.xlsx`,
      included: true,
      traces: {
        right: { x: [0, 10, 20, 30], y: [0, raw.p1n1AmplitudeUv / 2, raw.p1n1AmplitudeUv, 0] },
        left: { x: [0, 10, 20, 30], y: [0, raw.p1n1AmplitudeUv / 3, raw.p1n1AmplitudeUv * 0.9, 0] },
      },
      metrics: { raw },
      corrections: {},
      qc: [{ level: 'ok', message: 'ready' }],
    })
    const project = projectCore.normalizeProject({
      title: 'FVEP publication preset panels',
      savedAt: '2026-06-28T00:00:00.000Z',
      samples: [
        fvepSample('ctrl-05', 'control', 'FVEP(1)_白光0.5标闪-暗室 · 白色光: 0.50 cd·s/m² (100.0 ms)', {
          amplitudeUv: 8.1,
          p1n1AmplitudeUv: 8.1,
          p1n2AmplitudeUv: 12.3,
          p2n2AmplitudeUv: 18.45,
          n1LatencyMs: 22,
          p1LatencyMs: 29.4,
          n2LatencyMs: 46.15,
          p2LatencyMs: 60.15,
        }),
        fvepSample('cko-05', 'cko', 'FVEP(1)_白光0.5标闪-暗室 · 白色光: 0.50 cd·s/m² (100.0 ms)', {
          amplitudeUv: 3.8,
          p1n1AmplitudeUv: 3.8,
          p1n2AmplitudeUv: 6.2,
          p2n2AmplitudeUv: 10.25,
          n1LatencyMs: 22,
          p1LatencyMs: 29.8,
          n2LatencyMs: 43.3,
          p2LatencyMs: 60.3,
        }),
        fvepSample('ctrl-30', 'control', 'FVEP(2)_白光3.0标闪-暗室 · 白色光: 3.00 cd·s/m² (50.0 ms)', {
          amplitudeUv: 8.55,
          p1n1AmplitudeUv: 8.55,
          p1n2AmplitudeUv: 12.8,
          p2n2AmplitudeUv: 19.1,
          n1LatencyMs: 21.55,
          p1LatencyMs: 30.7,
          n2LatencyMs: 46.6,
          p2LatencyMs: 60.3,
        }),
        fvepSample('cko-30', 'cko', 'FVEP(2)_白光3.0标闪-暗室 · 白色光: 3.00 cd·s/m² (50.0 ms)', {
          amplitudeUv: 3.7,
          p1n1AmplitudeUv: 3.7,
          p1n2AmplitudeUv: 5.85,
          p2n2AmplitudeUv: 10.1,
          n1LatencyMs: 22.95,
          p1LatencyMs: 30.15,
          n2LatencyMs: 44.65,
          p2LatencyMs: 60.5,
        }),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'FVEP',
      protocolMode: 'FVEP',
      condition: 'All',
      metricKey: 'p1n1AmplitudeUv',
      metricVersion: 'raw',
      statsPolicy: 'descriptive-only',
    })
    const reportPackage = report.buildReportPackage(project, result, { reportScope: 'fvep-preset' })
    const html = exportCore.buildReportHtml(project, result, reportPackage)

    expect(html).toContain('P1-N1 amp summary')
    expect(html).toContain('P1-N2 amp summary')
    expect(html).toContain('P2-N2 amp summary')
    expect(html).toContain('N1 latency summary')
    expect(html).toContain('P1 latency summary')
    expect(html).toContain('N2 latency summary')
    expect(html).toContain('P2 latency summary')
    expect(html).toContain('P1-N1 amp (µV)')
    expect(html).toContain('P2 latency (ms)')
    expect(html).toContain('Stimulus (cd·s·m⁻²)')
  })

  test('uses a numeric stimulus axis for single-family ERG response curves', () => {
    const ergSample = (id, condition, value) => ({
      id,
      subjectId: id,
      acquisitionId: id,
      label: id,
      cohort: id.startsWith('ctrl') ? 'control' : 'cko',
      mode: 'FERG',
      condition,
      sourceName: `${id}.xlsx`,
      included: true,
      traces: {
        right: { x: [0, 10], y: [0, value] },
        left: { x: [0, 10], y: [0, value] },
      },
      metrics: { raw: { amplitudeUv: value, aAmplitudeUv: value / 2, bAmplitudeUv: value } },
      corrections: {},
      qc: [{ level: 'ok', message: 'ready' }],
    })
    const project = projectCore.normalizeProject({
      title: 'ERG dMax numeric axis',
      samples: [
        ergSample('ctrl-1', 'FERG(2)_dMax · b白色光:20.0cd.m-2,5ms', 20),
        ergSample('ctrl-2', 'FERG(3)_dMax · b白色光:200.0cd.m-2,5ms', 30),
        ergSample('cko-1', 'FERG(2)_dMax · b白色光:20.0cd.m-2,5ms', 10),
        ergSample('cko-2', 'FERG(3)_dMax · b白色光:200.0cd.m-2,5ms', 12),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'ERG',
      protocolMode: 'FERG',
      protocolFamily: 'dMax',
      condition: 'All',
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
    })
    const reportPackage = report.buildReportPackage(project, result)
    const html = exportCore.buildReportHtml(project, result, reportPackage)

    expect(html).toContain('Stimulus (cd·m⁻²)')
    expect(html).toContain('>20</text>')
    expect(html).toContain('>200</text>')
  })
})
