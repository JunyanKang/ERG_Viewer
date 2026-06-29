const analysis = require('../analysis')
const projectCore = require('../project')

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
        aAmplitudeUv: overrides.aAmplitudeUv ?? (Number.isFinite(overrides.amplitudeUv) ? overrides.amplitudeUv / 2 : undefined),
        bAmplitudeUv: overrides.bAmplitudeUv ?? overrides.amplitudeUv,
        sumOpAmplitudeUv: overrides.sumOpAmplitudeUv,
        p1n1AmplitudeUv: overrides.p1n1AmplitudeUv,
      },
    },
    corrections: overrides.corrections || {},
    qc: overrides.qc || [{ level: 'ok', message: 'ready' }],
  }
}

describe('ERG Viewer v2 scientific analysis model', () => {
  test('builds an ERG analysis result with cohort summary and Welch statistics', () => {
    const project = projectCore.normalizeProject({
      samples: [
        sample({ id: 'ctrl-1', cohort: 'Control', mode: 'FERG', condition: 'dMax', amplitudeUv: 12 }),
        sample({ id: 'ctrl-2', cohort: 'Control', mode: 'FERG', condition: 'dMax', amplitudeUv: 14 }),
        sample({ id: 'cko-1', cohort: 'CKO', mode: 'FERG', condition: 'dMax', amplitudeUv: 6 }),
        sample({ id: 'cko-2', cohort: 'CKO', mode: 'FERG', condition: 'dMax', amplitudeUv: 8 }),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'ERG',
      protocolMode: 'FERG',
      condition: 'dMax',
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
    })

    expect(result.sourceRows).toHaveLength(4)
    expect(result.analysisRows).toHaveLength(4)
    expect(result.cohortSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cohort: 'Control', n: 2, mean: 13, sd: 1.4142, sem: 1 }),
        expect.objectContaining({ cohort: 'CKO', n: 2, mean: 7, sd: 1.4142, sem: 1 }),
      ])
    )
    expect(result.stats.status).toBe('ok')
    expect(result.stats.test).toBe('Welch t-test')
    expect(result.stats.meanDiff).toBeGreaterThan(0)
    expect(result.stats.pValue).toBeGreaterThan(0)
    expect(result.stats.pValue).toBeLessThan(1)
    expect(result.waveformSummary).toMatchObject({ status: 'not-applicable', message: '' })
    expect(result.warnings).toEqual([])
  })

  test('treats dOps as an ERG protocol and excludes records from analysis rows', () => {
    const project = projectCore.normalizeProject({
      samples: [
        sample({
          id: 'ctrl-1',
          cohort: 'Control',
          mode: 'dOps',
          condition: 'dOps',
          amplitudeUv: 30,
          sumOpAmplitudeUv: 30,
        }),
        sample({
          id: 'ctrl-2',
          cohort: 'Control',
          mode: 'dOps',
          condition: 'dOps',
          amplitudeUv: 32,
          sumOpAmplitudeUv: 32,
        }),
        sample({
          id: 'cko-1',
          cohort: 'CKO',
          mode: 'dOps',
          condition: 'dOps',
          amplitudeUv: 12,
          sumOpAmplitudeUv: 12,
        }),
        sample({
          id: 'cko-2',
          cohort: 'CKO',
          mode: 'dOps',
          condition: 'dOps',
          amplitudeUv: 10,
          sumOpAmplitudeUv: 10,
          included: false,
        }),
        sample({
          id: 'fvep-1',
          cohort: 'Control',
          mode: 'FVEP',
          condition: 'FVEP',
          amplitudeUv: 3,
          p1n1AmplitudeUv: 3,
        }),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'ERG',
      protocolMode: 'dOps',
      condition: 'dOps',
      metricKey: 'sumOpAmplitudeUv',
      metricVersion: 'raw',
    })

    expect(result.sourceRows).toHaveLength(4)
    expect(result.sourceRows.every((row) => row.sourceType === 'ERG')).toBe(true)
    expect(result.analysisRows).toHaveLength(3)
    expect(result.cohortSummary.find((row) => row.cohort === 'CKO')).toMatchObject({ n: 1, mean: 12 })
    expect(result.stats.status).toBe('blocked')
    expect(result.stats.blockedBy).toBe('insufficient-n')
  })

  test('repairs stale metric selections when the protocol changes to Flicker', () => {
    const project = projectCore.normalizeProject({
      settings: { metricKey: 'bAmplitudeUv' },
      samples: [
        sample({
          id: 'flicker-1',
          cohort: 'Control',
          mode: 'Flicker',
          condition: 'Flicker',
          amplitudeUv: 51.4,
          flickerAmplitudeUv: 51.4,
        }),
      ],
    })
    project.samples[0].metrics.raw.flickerAmplitudeUv = 51.4

    const result = analysis.runAnalysis(project, {
      sourceType: 'ERG',
      protocolMode: 'Flicker',
      metricKey: 'bAmplitudeUv',
      metricVersion: 'raw',
    })

    expect(result.plan.metricKey).toBe('flickerAmplitudeUv')
    expect(result.sourceRows).toHaveLength(1)
    expect(result.sourceRows[0]).toMatchObject({
      mode: 'Flicker',
      metric: 'flickerAmplitudeUv',
      unit: 'µV',
      value: 51.4,
    })
  })

  test('blocks pooled inferential statistics when multiple conditions are selected', () => {
    const project = projectCore.normalizeProject({
      samples: [
        sample({
          id: 'ctrl-1',
          cohort: 'Control',
          mode: 'FVEP',
          condition: '0.5 cd',
          amplitudeUv: 8,
          p1n1AmplitudeUv: 8,
        }),
        sample({
          id: 'ctrl-2',
          cohort: 'Control',
          mode: 'FVEP',
          condition: '3.0 cd',
          amplitudeUv: 14,
          p1n1AmplitudeUv: 14,
        }),
        sample({
          id: 'cko-1',
          cohort: 'CKO',
          mode: 'FVEP',
          condition: '0.5 cd',
          amplitudeUv: 4,
          p1n1AmplitudeUv: 4,
        }),
        sample({
          id: 'cko-2',
          cohort: 'CKO',
          mode: 'FVEP',
          condition: '3.0 cd',
          amplitudeUv: 7,
          p1n1AmplitudeUv: 7,
        }),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'FVEP',
      protocolMode: 'FVEP',
      condition: 'All',
      metricKey: 'p1n1AmplitudeUv',
      metricVersion: 'raw',
    })

    expect(result.conditionSummary).toHaveLength(4)
    expect(result.cohortSummary).toEqual([])
    expect(result.stats.status).toBe('blocked')
    expect(result.stats.blockedBy).toBe('condition-pooling')
    expect(result.warnings.map((warning) => warning.code)).toContain('condition-pooling-blocked')
    expect(result.figureSeries.every((series) => series.type === 'condition-summary')).toBe(true)
    expect(result.waveformSummary.status).toBe('condition-required')
  })

  test('parses ERG stimulus metadata for publication response curves', () => {
    const meta = analysis.parseCondition('FERG(10)_dMax · f白色光:1000.0cd.m-2,5ms')

    expect(meta).toMatchObject({
      protocolIndex: 10,
      protocolFamily: 'dMax',
      adaptation: 'f',
      stimulusValue: 1000,
      stimulusUnit: 'cd/m2',
      durationMs: 5,
      shortLabel: 'dMax 1000',
    })
  })

  test('parses FVEP stimulus metadata with parenthesized duration', () => {
    const meta = analysis.parseCondition('FVEP(1)_白光0.5标闪-暗室 · 白色光: 0.50 cd·s/m² (100.0 ms)')

    expect(meta).toMatchObject({
      protocolIndex: 1,
      protocolFamily: '白光0.5标闪-暗室',
      stimulusValue: 0.5,
      stimulusUnit: 'cd·s/m²',
      durationMs: 100,
      shortLabel: '白光0.5标闪-暗室 0.5',
    })
  })

  test('builds FVEP cohort average waveforms only for one stimulus condition', () => {
    const project = projectCore.normalizeProject({
      samples: [
        sample({
          id: 'ctrl-1',
          cohort: 'Control',
          mode: 'FVEP',
          condition: '0.5 cd',
          amplitudeUv: 8,
          p1n1AmplitudeUv: 8,
        }),
        sample({
          id: 'ctrl-2',
          cohort: 'Control',
          mode: 'FVEP',
          condition: '0.5 cd',
          amplitudeUv: 9,
          p1n1AmplitudeUv: 9,
        }),
        sample({
          id: 'cko-1',
          cohort: 'CKO',
          mode: 'FVEP',
          condition: '0.5 cd',
          amplitudeUv: 4,
          p1n1AmplitudeUv: 4,
        }),
        sample({
          id: 'cko-2',
          cohort: 'CKO',
          mode: 'FVEP',
          condition: '0.5 cd',
          amplitudeUv: 5,
          p1n1AmplitudeUv: 5,
        }),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'FVEP',
      protocolMode: 'FVEP',
      condition: '0.5 cd',
      metricKey: 'p1n1AmplitudeUv',
      metricVersion: 'raw',
    })

    expect(result.waveformSummary.status).toBe('ok')
    expect(result.waveformSummary.condition).toBe('0.5 cd')
    expect(result.waveformSummary.series).toHaveLength(2)
    expect(result.waveformSummary.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cohort: 'Control', n: 2, x: [0, 1], meanY: [0, 1] }),
        expect.objectContaining({ cohort: 'CKO', n: 2, x: [0, 1], meanY: [0, 1] }),
      ])
    )
  })

  test('enumerates analysis design options from the current project scope', () => {
    const project = projectCore.normalizeProject({
      samples: [
        sample({ id: 'erg-1', cohort: 'Control', mode: 'FERG', condition: 'dMax', amplitudeUv: 12 }),
        sample({
          id: 'erg-2',
          cohort: 'Control',
          mode: 'FERG',
          condition: 'FERG(10)_dMax · f白色光:1000.0cd.m-2,5ms',
          amplitudeUv: 18,
        }),
        sample({ id: 'ops-1', cohort: 'Control', mode: 'dOps', condition: 'dOps', amplitudeUv: 20 }),
        sample({
          id: 'fvep-1',
          cohort: 'CKO',
          mode: 'FVEP',
          condition: '0.5 cd',
          amplitudeUv: 4,
          p1n1AmplitudeUv: 4,
        }),
      ],
    })

    const allOptions = analysis.availableAnalysisOptions(project, { sourceType: 'All' })
    const fvepOptions = analysis.availableAnalysisOptions(project, {
      sourceType: 'FVEP',
      protocolMode: 'FVEP',
    })

    expect(allOptions.sourceTypes).toEqual(['All', 'ERG', 'FVEP'])
    expect(allOptions.protocols).toEqual(expect.arrayContaining(['All', 'dOps', 'FERG', 'FVEP']))
    expect(allOptions.protocolFamilies).toEqual(expect.arrayContaining(['All', 'dMax', 'dOps']))
    expect(fvepOptions.protocols).toEqual(['All', 'FVEP'])
    expect(fvepOptions.protocolFamilies).toEqual(['All', '0.5 cd'])
    expect(fvepOptions.conditions).toEqual(['All', '0.5 cd'])
    expect(fvepOptions.statsPolicies).toContain('welch')
    expect(fvepOptions.biologicalUnits).toEqual(['subject', 'acquisition'])
    expect(fvepOptions.eyeAggregations).toEqual(['average-eyes', 'right-eye', 'left-eye'])
    expect(fvepOptions.comparisonDesigns).toEqual(['independent', 'paired'])
  })

  test('records statistical design and supports single-eye metric extraction', () => {
    const project = projectCore.normalizeProject({
      settings: {
        biologicalUnit: 'subject',
        eyeAggregation: 'right-eye',
        comparisonDesign: 'paired',
      },
      samples: [
        {
          id: 'ctrl-1',
          subjectId: 'ctrl-1',
          acquisitionId: '01',
          label: 'ctrl-1',
          cohort: 'Control',
          mode: 'FERG',
          condition: 'dMax',
          sourceName: 'ctrl.xlsx',
          traces: { right: { x: [0, 1], y: [0, 1] }, left: { x: [0, 1], y: [0, 1] } },
          machineMarks: { right: 'a:10ms -20uv b:40ms 80uv', left: 'a:10ms -20uv b:40ms 30uv' },
        },
        {
          id: 'cko-1',
          subjectId: 'cko-1',
          acquisitionId: '01',
          label: 'cko-1',
          cohort: 'CKO',
          mode: 'FERG',
          condition: 'dMax',
          sourceName: 'cko.xlsx',
          traces: { right: { x: [0, 1], y: [0, 1] }, left: { x: [0, 1], y: [0, 1] } },
          machineMarks: { right: 'a:10ms -10uv b:40ms 40uv', left: 'a:10ms -10uv b:40ms 20uv' },
        },
      ],
    })

    const result = analysis.runAnalysis(project, {
      sourceType: 'ERG',
      protocolMode: 'FERG',
      condition: 'dMax',
      metricKey: 'bAmplitudeUv',
      metricVersion: 'raw',
    })

    expect(result.plan).toMatchObject({
      biologicalUnit: 'subject',
      eyeAggregation: 'right-eye',
      comparisonDesign: 'paired',
    })
    expect(result.sourceRows[0]).toMatchObject({
      value: 100,
      pairedId: 'ctrl-1',
      biologicalUnit: 'subject',
      eyeAggregation: 'right-eye',
      comparisonDesign: 'paired',
    })
    expect(result.snapshot).toMatchObject({
      biologicalUnit: 'subject',
      eyeAggregation: 'right-eye',
      comparisonDesign: 'paired',
    })
    expect(result.warnings.map((warning) => warning.code)).toContain('paired-design-descriptive')
    expect(result.stats).toMatchObject({ status: 'blocked', blockedBy: 'paired-design' })
  })

  test('reports paired-ID readiness problems before paired inference is enabled', () => {
    const project = projectCore.normalizeProject({
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
        sample({
          id: 'baseline-2-repeat',
          subjectId: 'mouse-2',
          pairedId: 'mouse-2',
          cohort: 'Baseline',
          mode: 'FVEP',
          condition: '3.0 cd',
          amplitudeUv: 7.5,
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
    const warningCodes = result.warnings.map((warning) => warning.code)

    expect(result.sourceRows.map((row) => row.pairedId)).toEqual(['mouse-1', 'mouse-1', 'mouse-2', 'mouse-2'])
    expect(warningCodes).toEqual(
      expect.arrayContaining(['paired-design-descriptive', 'paired-id-duplicate', 'paired-id-incomplete'])
    )
    expect(result.pairedReadiness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: 'paired-id-duplicate',
          condition: '3.0 cd',
          cohort: 'Baseline',
          pairedId: 'mouse-2',
          sampleIds: ['baseline-2', 'baseline-2-repeat'],
        }),
        expect.objectContaining({
          issue: 'paired-id-incomplete',
          condition: '3.0 cd',
          cohort: 'Baseline',
          pairedId: 'mouse-2',
          sampleIds: ['baseline-2', 'baseline-2-repeat'],
        }),
      ])
    )
    expect(result.stats).toMatchObject({ status: 'blocked', blockedBy: 'paired-design' })
  })

  test('filters ERG response analysis by protocol family before condition summaries', () => {
    const project = projectCore.normalizeProject({
      samples: [
        sample({
          id: 'rod-1',
          cohort: 'Control',
          mode: 'FERG',
          condition: 'FERG(1)_dRod · b白色光:3.0cd.m-2,4ms',
          amplitudeUv: 8,
        }),
        sample({
          id: 'max-1',
          cohort: 'Control',
          mode: 'FERG',
          condition: 'FERG(2)_dMax · b白色光:20.0cd.m-2,5ms',
          amplitudeUv: 18,
        }),
        sample({
          id: 'max-2',
          cohort: 'CKO',
          mode: 'FERG',
          condition: 'FERG(2)_dMax · b白色光:20.0cd.m-2,5ms',
          amplitudeUv: 11,
        }),
        sample({
          id: 'cone-1',
          cohort: 'Control',
          mode: 'FERG',
          condition: 'FERG(3)_lCone · f白色光:600.0cd.m-2,5ms',
          amplitudeUv: 30,
        }),
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

    expect(result.sourceRows).toHaveLength(2)
    expect(result.sourceRows.every((row) => row.protocolFamily === 'dMax')).toBe(true)
    expect(result.conditionSummary).toHaveLength(2)
    expect(result.conditionSummary.every((row) => row.conditionShort === 'dMax 20')).toBe(true)
    expect(result.scopeLabel).toBe('ERG · FERG · dMax')
  })

  test('normalizes legacy corrected layer to manual and reports QC warnings', () => {
    const project = projectCore.normalizeProject({
      samples: [
        sample({
          id: 'ctrl-1',
          cohort: 'Control',
          mode: 'FERG',
          condition: 'dMax',
          amplitudeUv: 20,
          corrections: { manualPoints: { right: { a: { x: 1, y: -2 }, b: { x: 2, y: 10 } } } },
          qc: [{ level: 'warn', message: 'short trace' }],
        }),
        sample({ id: 'ctrl-2', cohort: 'Control', mode: 'FERG', condition: 'dMax', amplitudeUv: 22 }),
        sample({ id: 'cko-1', cohort: 'CKO', mode: 'FERG', condition: 'dMax', amplitudeUv: 10 }),
        sample({ id: 'cko-2', cohort: 'CKO', mode: 'FERG', condition: 'dMax', amplitudeUv: 11 }),
      ],
    })
    const result = analysis.runAnalysis(project, {
      sourceType: 'ERG',
      protocolMode: 'FERG',
      condition: 'dMax',
      metricKey: 'amplitudeUv',
      metricVersion: 'corrected',
    })

    expect(result.plan.metricVersion).toBe('manual')
    expect(result.sourceRows.some((row) => row.source === 'manual')).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['qc-included']))
  })

  test('validates empty or impossible analysis scopes with explicit warnings', () => {
    const project = projectCore.normalizeProject({
      samples: [
        sample({
          id: 'ctrl-1',
          cohort: 'Control',
          mode: 'FVEP',
          condition: 'FVEP',
          amplitudeUv: 3,
          p1n1AmplitudeUv: 3,
        }),
      ],
    })
    const warnings = analysis.validateAnalysisPlan(project, {
      sourceType: 'ERG',
      protocolMode: 'FERG',
      condition: 'dMax',
      metricKey: 'amplitudeUv',
      metricVersion: 'raw',
    })

    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: 'no-records',
        level: 'error',
      })
    )
  })
})
