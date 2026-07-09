const projectCore = require('../project')
const demo = require('../demo-data')
const XLSX = require('xlsx')

describe('OptoERGViewer v2 project model', () => {
  test('normalizes imported project shape', () => {
    const project = projectCore.normalizeProject({
      title: 'Example',
      samples: [
        { label: 'control-1', traces: { right: { x: [0, 1], y: [0, 5] }, left: { x: [0, 1], y: [0, 4] } } },
      ],
    })
    expect(project.schema).toBe('erg-viewer-v2-project')
    expect(project.samples[0].cohort).toBe('Control')
    expect(project.samples[0].pairedId).toBe('control-1')
    expect(project.samples[0].inference).toMatchObject({
      cohort: 'Control',
      pairedId: 'control-1',
    })
    expect(project.settings.selectedSampleId).toBe(project.samples[0].id)
  })

  test('creates stable ids and keeps demo samples valid', () => {
    expect(projectCore.makeId('CKO sample 01.xlsx')).toBe('cko-sample-01-xlsx')
    const project = projectCore.normalizeProject(demo.createDemoProject())
    expect(project.samples.length).toBe(192)
    expect(project.sources.length).toBe(8)
    expect(new Set(project.samples.map((sample) => sample.cohort))).toEqual(new Set(['ctrl', 'ko']))
    expect(project.samples.every((sample) => sample.metrics.raw.amplitudeUv > 0)).toBe(true)
    const rod = project.samples.find((sample) => String(sample.condition || '').includes('dRod'))
    expect(rod.machineMarks.right).toContain('a:')
    expect(rod.metrics.raw.aAmplitudeUv).toBeLessThan(0)
    expect(rod.metrics.raw.bAmplitudeUv).toBeGreaterThan(0)
    const modeExpectations = [
      ['dRod', ['aAmplitudeUv', 'aLatencyMs', 'bAmplitudeUv', 'bLatencyMs']],
      ['dMax', ['aAmplitudeUv', 'aLatencyMs', 'bAmplitudeUv', 'bLatencyMs']],
      ['dOps', ['sumOpAmplitudeUv']],
      ['lCone', ['aAmplitudeUv', 'aLatencyMs', 'bAmplitudeUv', 'bLatencyMs']],
      ['lFlicker', ['flickerAmplitudeUv', 'flickerPhaseDeg', 'flickerWaveformAmplitudeUv']],
    ]
    modeExpectations.forEach(([modeName, keys]) => {
      const rows = project.samples.filter((sample) => String(sample.condition || '').includes(modeName))
      expect(rows.length).toBeGreaterThan(0)
      rows.forEach((sample) => {
        expect(sample.machineMarks.right).not.toBe('')
        expect(sample.machineMarks.left).not.toBe('')
        keys.forEach((key) => expect(Number.isFinite(sample.metrics.raw[key])).toBe(true))
      })
    })
  })

  test('parses one FERG template file into multiple acquisition records', () => {
    const workbook = XLSX.readFile('test-fixtures/opto/demo-control-1_FERG.xlsx')
    const records = projectCore.parseWorkbookToSamples(workbook, 'test-fixtures/opto/demo-control-1_FERG.xlsx')
    expect(records.length).toBe(24)
    expect(records[0].mode).toBe('FERG')
    expect(records.find((record) => record.condition.includes('dOps')).mode).toBe('dOps')
    expect(records.find((record) => record.condition.includes('Flicker')).mode).toBe('Flicker')
    expect(records[0].subjectId).toBe('demo-control-1')
    expect(records[0].cohort).toBe('control')
    expect(records[0].pairedId).toBe('demo-control-1')
    expect(records[0].inference).toMatchObject({
      cohort: 'control',
      cohortSource: 'metadata',
      pairedId: 'demo-control-1',
      pairedIdSource: 'subject',
    })
    expect(records[0].traces.right.y.length).toBeGreaterThan(100)
    expect(records[0].traces.left.y.length).toBeGreaterThan(100)
    expect(records[0].machineMarks.right).toContain('a:')
    expect(records[0].metrics.raw.bAmplitudeUv).toBeGreaterThan(100)
    const flicker = records.find((record) => record.mode === 'Flicker')
    expect(flicker.machineMarks.right).toContain('幅值')
    expect(flicker.metrics.raw.flickerAmplitudeUv).toBeGreaterThan(1)
    expect(flicker.metrics.raw.flickerPhaseDeg).toBeGreaterThanOrEqual(0)
    expect(flicker.metrics.raw.aLatencyMs).toBeUndefined()
  })

  test('keeps generated ERG fixture mode metrics complete', () => {
    const generatedRecords = projectCore.parseWorkbookToSamples(
      XLSX.readFile('test-fixtures/opto/demo-control-1_FERG.xlsx'),
      'test-fixtures/opto/demo-control-1_FERG.xlsx'
    )
    const expectations = [
      ['Rod', 'dRod', ['aAmplitudeUv', 'aLatencyMs', 'bAmplitudeUv', 'bLatencyMs']],
      ['Max', 'dMax', ['aAmplitudeUv', 'aLatencyMs', 'bAmplitudeUv', 'bLatencyMs']],
      ['OPs', 'dOps', ['sumOpAmplitudeUv']],
      ['Cone', 'lCone', ['aAmplitudeUv', 'aLatencyMs', 'bAmplitudeUv', 'bLatencyMs']],
      ['Flicker', 'lFlicker', ['flickerAmplitudeUv', 'flickerPhaseDeg']],
    ]
    expectations.forEach(([_label, conditionToken, keys]) => {
      const rows = generatedRecords.filter((record) => String(record.condition || '').includes(conditionToken))
      expect(rows.length, `${conditionToken} records`).toBeGreaterThan(0)
      rows.forEach((record) => {
        expect(record.machineMarks.right, `${conditionToken} right mark`).not.toBe('')
        expect(record.machineMarks.left, `${conditionToken} left mark`).not.toBe('')
        keys.forEach((key) => {
          expect(Number.isFinite(record.metrics.raw[key]), `${conditionToken} ${key}`).toBe(true)
        })
      })
    })
  })

  test('detects unsupported workbook and project file formats before import', () => {
    const invalidWorkbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      invalidWorkbook,
      XLSX.utils.aoa_to_sheet([
        ['time', 'value'],
        [0, 1],
        [1, 2],
      ]),
      'numeric-only'
    )
    const fallbackRecords = projectCore.parseWorkbookToSamples(invalidWorkbook, 'random.xlsx')

    expect(fallbackRecords.length).toBe(1)
    expect(fallbackRecords[0].metadata.fallbackParser).toBe(true)
    expect(projectCore.hasExpectedWorkbookFormat(fallbackRecords)).toBe(false)
    expect(projectCore.isProjectFilePayload({ schema: 'erg-viewer-v2-project', samples: [] })).toBe(true)
    expect(projectCore.isProjectFilePayload({ schema: 'other', samples: [] })).toBe(false)
    expect(projectCore.isProjectFilePayload({ schema: 'erg-viewer-v2-project' })).toBe(false)
  })

  test('parses one FVEP template file into multiple acquisition records', () => {
    const workbook = XLSX.readFile('test-fixtures/opto/demo-control-1_FVEP.xlsx')
    const records = projectCore.parseWorkbookToSamples(workbook, 'test-fixtures/opto/demo-control-1_FVEP.xlsx')
    expect(records.length).toBe(3)
    expect(records[0].mode).toBe('FVEP')
    expect(records[0].subjectId).toBe('demo-control-1')
    expect(records[0].pairedId).toBe('demo-control-1')
    expect(records[0].condition).toContain('FVEP')
    expect(records[0].machineMarks.right).toContain('N1')
    expect(records[0].metrics.raw.p1n1AmplitudeUv).toBeGreaterThan(1)
  })

  test('supports mixed multi-file ERG and FVEP import batches', () => {
    const files = [
      'test-fixtures/opto/demo-control-1_FERG.xlsx',
      'test-fixtures/opto/demo-control-1_FVEP.xlsx',
      'test-fixtures/opto/demo-cko-1_FERG.xlsx',
      'test-fixtures/opto/demo-cko-1_FVEP.xlsx',
    ]
    const records = files.flatMap((file) => projectCore.parseWorkbookToSamples(XLSX.readFile(file), file))
    expect(records.length).toBe(54)
    expect(new Set(records.map((record) => record.mode))).toEqual(
      new Set(['FERG', 'dOps', 'Flicker', 'FVEP'])
    )
    expect(new Set(records.map((record) => record.subjectId))).toEqual(
      new Set(['demo-control-1', 'demo-cko-1'])
    )
  })

  test('derives one source row per imported workbook with ERG or FVEP file type', () => {
    const files = [
      'test-fixtures/opto/demo-control-1_FERG.xlsx',
      'test-fixtures/opto/demo-control-1_FVEP.xlsx',
      'test-fixtures/opto/demo-cko-1_FERG.xlsx',
      'test-fixtures/opto/demo-cko-1_FVEP.xlsx',
    ]
    const samples = files.flatMap((file) => projectCore.parseWorkbookToSamples(XLSX.readFile(file), file))
    const project = projectCore.normalizeProject({ title: 'Mixed batch', samples })
    const sourcesByPath = new Map(project.sources.map((source) => [source.path, source]))

    expect(project.sources).toHaveLength(4)
    expect(sourcesByPath.get('test-fixtures/opto/demo-control-1_FERG.xlsx')).toMatchObject({
      type: 'ERG',
      records: 24,
    })
    expect(sourcesByPath.get('test-fixtures/opto/demo-control-1_FERG.xlsx').modes).toEqual([
      'dOps',
      'FERG',
      'Flicker',
    ])
    expect(sourcesByPath.get('test-fixtures/opto/demo-control-1_FVEP.xlsx')).toMatchObject({
      type: 'FVEP',
      records: 3,
    })
    expect(sourcesByPath.get('test-fixtures/opto/demo-control-1_FVEP.xlsx').modes).toEqual(['FVEP'])
  })

  test('removes an imported source workbook and all related acquisition records', () => {
    const files = ['test-fixtures/opto/demo-control-1_FERG.xlsx', 'test-fixtures/opto/demo-control-1_FVEP.xlsx']
    const samples = files.flatMap((file) => projectCore.parseWorkbookToSamples(XLSX.readFile(file), file))
    const project = projectCore.normalizeProject({
      title: 'Remove source',
      samples,
      settings: {
        activeStep: 'Review',
        selectedSampleId: samples[0].id,
        metricKey: 'amplitudeUv',
        metricVersion: 'raw',
        recordFilter: 'ERG',
      },
    })

    const updated = projectCore.removeSourceFromProject(project, 'test-fixtures/opto/demo-control-1_FERG.xlsx')

    expect(updated.samples).toHaveLength(3)
    expect(updated.samples.every((sample) => sample.mode === 'FVEP')).toBe(true)
    expect(updated.sources).toHaveLength(1)
    expect(updated.sources[0]).toMatchObject({
      path: 'test-fixtures/opto/demo-control-1_FVEP.xlsx',
      type: 'FVEP',
      records: 3,
    })
    expect(updated.settings.selectedSampleId).toBe(updated.samples[0].id)
    expect(updated.settings.recordFilter).toBe('All')
    expect(updated.savedAt).toBe('')
  })

  test('normalizes project files for reproducible re-analysis', () => {
    const project = projectCore.normalizeProject(demo.createDemoProject())
    project.settings.metricKey = 'bLatencyMs'
    project.settings.metricVersion = 'corrected'
    project.settings.recordFilter = 'ERG'
    project.settings.analysisSourceType = 'FVEP'
    project.settings.analysisProtocolMode = 'FVEP'
    project.settings.analysisProtocolFamily = 'FVEP'
    project.settings.analysisCondition = 'FVEP(1)_0.5 cd'
    project.settings.reportScope = 'fvep-preset'
    project.settings.statsPolicy = 'welch'
    project.settings.biologicalUnit = 'acquisition'
    project.settings.eyeAggregation = 'right-eye'
    project.settings.comparisonDesign = 'paired'
    project.samples[0].pairedId = 'pair-01'
    project.samples[0].corrections.manualPoints.right.a = { x: 30, y: -80 }
    project.samples[0].corrections.manualPoints.right.b = { x: 74, y: 180 }
    project.samples[1].mode = 'Flicker'
    project.samples[1].corrections.manualPoints.right.flickerTrough = { x: 70, y: -18 }
    project.samples[1].corrections.manualPoints.right.flickerPeak = { x: 95, y: 36 }
    const reopened = projectCore.normalizeProject(JSON.parse(JSON.stringify(project)))
    expect(reopened.schema).toBe('erg-viewer-v2-project')
    expect(reopened.settings.metricKey).toBe('bLatencyMs')
    expect(reopened.settings.metricVersion).toBe('manual')
    expect(reopened.settings.recordFilter).toBe('ERG')
    expect(reopened.settings.analysisSourceType).toBe('FVEP')
    expect(reopened.settings.analysisProtocolMode).toBe('FVEP')
    expect(reopened.settings.analysisProtocolFamily).toBe('FVEP')
    expect(reopened.settings.analysisCondition).toBe('FVEP(1)_0.5 cd')
    expect(reopened.settings.reportScope).toBe('fvep-preset')
    expect(reopened.settings.statsPolicy).toBe('welch')
    expect(reopened.settings.biologicalUnit).toBe('acquisition')
    expect(reopened.settings.eyeAggregation).toBe('right-eye')
    expect(reopened.settings.comparisonDesign).toBe('paired')
    expect(reopened.samples[0].pairedId).toBe('pair-01')
    expect(reopened.samples[0].inference.pairedId).toBe('ctrl-01')
    expect(reopened.sources.length).toBeGreaterThan(0)
    expect(reopened.correctionLog.length).toBeGreaterThanOrEqual(1)
    expect(reopened.correctionLog.some((entry) => entry.subjectId === 'ctrl-01')).toBe(true)
    expect(reopened.samples[1].corrections.manualPoints.right.flickerTrough).toEqual({ x: 70, y: -18 })
    expect(reopened.samples[1].corrections.manualPoints.right.flickerPeak).toEqual({ x: 95, y: 36 })
    expect(reopened.correctionLog.find((entry) => entry.sampleId === reopened.samples[0].id).manualPoints).toBe(2)
    expect(reopened.correctionLog.find((entry) => entry.sampleId === reopened.samples[1].id).manualPoints).toBe(2)
  })
})
