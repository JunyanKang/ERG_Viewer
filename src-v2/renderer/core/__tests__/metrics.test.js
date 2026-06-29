const metrics = require('../metrics')
const demo = require('../demo-data')

describe('ERG Viewer v2 metrics', () => {
  test('derives amplitude and latency metrics from bilateral traces', () => {
    const project = demo.createDemoProject()
    const sample = project.samples[0]
    const raw = metrics.deriveRawMetrics(sample)
    expect(raw.amplitudeUv).toBeGreaterThan(100)
    expect(sample.machineMarks.right).toContain('a:')
    expect(raw.aAmplitudeUv).toBeLessThan(0)
    expect(raw.bAmplitudeUv).toBeGreaterThan(100)
    expect(raw.aLatencyMs).toBeGreaterThan(20)
    expect(raw.bLatencyMs).toBeGreaterThan(raw.aLatencyMs)
  })

  test('derives machine metrics from OPTOPROBE a/b marks when present', () => {
    const raw = metrics.deriveRawMetrics({
      mode: 'FERG',
      machineMarks: {
        right: 'a: 15.0ms -120.0uv b: 35.0ms 450.0uv',
        left: 'a: 16.0ms -100.0uv b: 36.0ms 420.0uv',
      },
      traces: { right: { x: [], y: [] }, left: { x: [], y: [] } },
    })
    expect(raw.aLatencyMs).toBe(15.5)
    expect(raw.bLatencyMs).toBe(35.5)
    expect(raw.bAmplitudeUv).toBe(545)
  })

  test('keeps Flicker machine amplitude and phase separate from a/b-wave metrics', () => {
    const raw = metrics.deriveRawMetrics({
      mode: 'Flicker',
      machineMarks: {
        right: '幅值: 50.8uv 相位: 33.9°',
        left: '幅值: 52.0uv 相位: 32.8°',
      },
      traces: { right: { x: [], y: [] }, left: { x: [], y: [] } },
    })

    expect(raw.flickerAmplitudeUv).toBe(51.4)
    expect(raw.flickerPhaseDeg).toBeCloseTo(33.35, 1)
    expect(raw.amplitudeUv).toBe(51.4)
    expect(raw.aLatencyMs).toBeUndefined()
    expect(raw.bLatencyMs).toBeUndefined()
  })

  test('recomputes Flicker Fourier amplitude and phase from waveform when marks are absent', () => {
    const x = Array.from({ length: 120 }, (_item, index) => index)
    const y = x.map((value) => 25 * Math.sin((2 * Math.PI * 4 * value) / 120 + Math.PI / 5))
    const raw = metrics.deriveRawMetrics({
      mode: 'Flicker',
      machineMarks: { right: '', left: '' },
      traces: {
        right: { x, y },
        left: { x, y: y.map((value) => value * 0.92) },
      },
    })

    expect(raw.flickerWaveformAmplitudeUv).toBeGreaterThan(20)
    expect(raw.flickerWaveformPhaseDeg).toBeGreaterThanOrEqual(0)
    expect(raw.flickerDominantFrequencyHz).toBeGreaterThan(30)
    expect(raw.flickerAmplitudeUv).toBe(raw.flickerWaveformAmplitudeUv)
  })

  test('uses manual point picks as the corrected layer without changing raw metrics', () => {
    const raw = { amplitudeUv: 100, aLatencyMs: 30, bLatencyMs: 70, baRatio: 2.1 }
    const corrected = metrics.correctedMetrics(raw, {
      mode: 'FERG',
      manualPoints: {
        right: { a: { x: 31, y: -60 }, b: { x: 76, y: 140 } },
        left: { a: { x: 33, y: -50 }, b: { x: 78, y: 130 } },
      },
    })
    expect(corrected.aLatencyMs).toBe(32)
    expect(corrected.bLatencyMs).toBe(77)
    expect(corrected.bAmplitudeUv).toBe(190)
    expect(raw.amplitudeUv).toBe(100)
  })

  test('uses manual FVEP N/P picks for corrected peak latency and amplitude pairs', () => {
    const raw = { amplitudeUv: 8, p1n1AmplitudeUv: 8, n1LatencyMs: 20, p1LatencyMs: 40 }
    const corrected = metrics.correctedMetrics(raw, {
      mode: 'FVEP',
      manualPoints: {
        right: { N1: { x: 18, y: -4 }, P1: { x: 42, y: 7 }, N2: { x: 71, y: -2 } },
        left: { N1: { x: 20, y: -5 }, P1: { x: 44, y: 8 }, N2: { x: 74, y: -3 } },
      },
    })

    expect(corrected.n1LatencyMs).toBe(19)
    expect(corrected.p1LatencyMs).toBe(43)
    expect(corrected.p1n1AmplitudeUv).toBe(12)
    expect(corrected.p1n2AmplitudeUv).toBe(10)
    expect(raw.p1n1AmplitudeUv).toBe(8)
  })

  test('uses manual dOps OP peak and valley picks for corrected summed OP amplitude', () => {
    const raw = { amplitudeUv: 50, sumOpAmplitudeUv: 50 }
    const corrected = metrics.correctedMetrics(raw, {
      mode: 'dOps',
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
    })

    expect(corrected.sumOpAmplitudeUv).toBe(16)
    expect(corrected.amplitudeUv).toBe(16)
    expect(raw.sumOpAmplitudeUv).toBe(50)
  })

  test('uses manual Flicker trough and peak picks for corrected amplitude and peak time', () => {
    const raw = {
      amplitudeUv: 51.4,
      flickerAmplitudeUv: 51.4,
      flickerPhaseDeg: 33.35,
      flickerDominantFrequencyHz: 8,
    }
    const corrected = metrics.correctedMetrics(raw, {
      mode: 'Flicker',
      manualPoints: {
        right: { flickerTrough: { x: 70, y: -18 }, flickerPeak: { x: 95, y: 36 } },
        left: { flickerTrough: { x: 72, y: -20 }, flickerPeak: { x: 98, y: 32 } },
      },
    })

    expect(corrected.flickerAmplitudeUv).toBe(53)
    expect(corrected.amplitudeUv).toBe(53)
    expect(corrected.flickerImplicitTimeMs).toBe(96.5)
    expect(corrected.flickerPhaseDeg).toBeCloseTo(277.92, 1)
    expect(raw.flickerAmplitudeUv).toBe(51.4)
  })

  test('summarizes included samples by cohort', () => {
    const project = demo.createDemoProject()
    project.samples[0].included = false
    const summary = metrics.summarizeGroups(project.samples, 'amplitudeUv', 'corrected')
    expect(summary.map((row) => row.cohort).sort()).toEqual(['ctrl', 'ko'])
    expect(summary.find((row) => row.cohort === 'ctrl').n).toBeGreaterThan(90)
  })
})
