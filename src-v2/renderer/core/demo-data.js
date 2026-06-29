;(function initDemoData(root, factory) {
  const api = factory(root.ERGv2Metrics || (typeof require === 'function' ? require('./metrics') : null))
  if (typeof module === 'object' && module.exports) module.exports = api
  root.ERGv2DemoData = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory(metrics) {
  function makeTrace(amplitude, latencyShift, noiseSeed, protocol) {
    const x = []
    const y = []
    const family = String((protocol && protocol.family) || '').toLowerCase()
    for (let index = 0; index <= 160; index += 1) {
      const t = index * 1.25
      const drift = 2.8 * Math.sin((index + noiseSeed) / 13)
      let value
      if (family === 'drod') {
        value =
          -0.18 * amplitude * gaussian(t, 42 + latencyShift, 14) +
          0.72 * amplitude * gaussian(t, 102 + latencyShift, 30) +
          0.1 * amplitude * gaussian(t, 158 + latencyShift, 38) +
          drift
      } else if (family === 'dops') {
        const envelope = gaussian(t, 86 + latencyShift, 28)
        const oscillation =
          Math.sin((2 * Math.PI * (t - 48)) / 15) + 0.48 * Math.sin((2 * Math.PI * (t - 54)) / 8.5)
        value =
          -0.1 * amplitude * gaussian(t, 35 + latencyShift, 9) +
          0.2 * amplitude * gaussian(t, 72 + latencyShift, 20) +
          0.42 * amplitude * envelope * oscillation +
          drift * 0.45
      } else if (family === 'lcone') {
        value =
          -0.26 * amplitude * gaussian(t, 22 + latencyShift * 0.45, 7) +
          0.58 * amplitude * gaussian(t, 47 + latencyShift * 0.45, 12) +
          0.08 * amplitude * gaussian(t, 88 + latencyShift * 0.35, 20) +
          drift * 0.55
      } else if (family === 'lflicker') {
        const envelope = 0.72 + 0.22 * gaussian(t, 82 + latencyShift * 0.25, 54)
        value =
          0.34 * amplitude * envelope * Math.sin((2 * Math.PI * (t + noiseSeed * 0.08)) / 31) +
          0.12 * amplitude * Math.sin((2 * Math.PI * t) / 15.5) +
          drift * 0.35
      } else {
        value =
          -0.5 * amplitude * gaussian(t, 31 + latencyShift, 9) +
          0.96 * amplitude * gaussian(t, 73 + latencyShift, 17) +
          0.18 * amplitude * gaussian(t, 122 + latencyShift, 26) +
          drift
      }
      x.push(Number(t.toFixed(2)))
      y.push(Number(value.toFixed(3)))
    }
    return { x, y }
  }

  function machineMarksForProtocol(protocol, right, left) {
    const mode = String((protocol && protocol.mode) || '').toLowerCase()
    if (mode === 'ferg') {
      return {
        right: formatABMark(pickABPoints(right)),
        left: formatABMark(pickABPoints(left)),
      }
    }
    if (mode === 'dops') {
      return {
        right: `∑O: ${formatNumber(traceAmplitude(right))}uv`,
        left: `∑O: ${formatNumber(traceAmplitude(left))}uv`,
      }
    }
    if (mode === 'flicker') {
      const rightFlicker = estimateFlickerPoint(right)
      const leftFlicker = estimateFlickerPoint(left)
      return {
        right: `幅值: ${formatNumber(rightFlicker.amplitude)}uv 相位: ${formatNumber(rightFlicker.phaseDeg)}°`,
        left: `幅值: ${formatNumber(leftFlicker.amplitude)}uv 相位: ${formatNumber(leftFlicker.phaseDeg)}°`,
      }
    }
    return { right: '', left: '' }
  }

  function pickABPoints(trace) {
    if (!trace || !Array.isArray(trace.x) || !Array.isArray(trace.y)) return null
    const aIndex = bestTraceIndex(trace, 10, 60, (candidate, current) => candidate < current)
    const aTime = aIndex >= 0 ? Number(trace.x[aIndex]) : 0
    const bIndex = bestTraceIndex(trace, Math.max(25, aTime + 5), 140, (candidate, current) => candidate > current)
    if (aIndex < 0 || bIndex < 0) return null
    return {
      a: { x: Number(trace.x[aIndex]), y: Number(trace.y[aIndex]) },
      b: { x: Number(trace.x[bIndex]), y: Number(trace.y[bIndex]) },
    }
  }

  function bestTraceIndex(trace, startMs, endMs, compare) {
    let best = -1
    for (let index = 0; index < trace.y.length; index += 1) {
      const x = Number(trace.x[index])
      const y = Number(trace.y[index])
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < startMs || x > endMs) continue
      if (best < 0 || compare(y, Number(trace.y[best]))) best = index
    }
    return best
  }

  function traceAmplitude(trace) {
    const values = trace && Array.isArray(trace.y) ? trace.y.map(Number).filter(Number.isFinite) : []
    return values.length ? Math.max(...values) - Math.min(...values) : null
  }

  function estimateFlickerPoint(trace) {
    const spectrum = dominantFourier(trace)
    return {
      amplitude: spectrum && Number.isFinite(spectrum.amplitude) ? spectrum.amplitude : traceAmplitude(trace),
      phaseDeg: spectrum && Number.isFinite(spectrum.phaseDeg) ? spectrum.phaseDeg : 0,
    }
  }

  function dominantFourier(trace) {
    if (!trace || !Array.isArray(trace.y)) return null
    const values = trace.y.map(Number).filter(Number.isFinite)
    const n = values.length
    if (n < 8) return null
    const baseline = values.reduce((sum, value) => sum + value, 0) / n
    const centered = values.map((value) => value - baseline)
    const maxBin = Math.min(20, Math.floor(n / 2))
    let best = null
    for (let k = 1; k <= maxBin; k += 1) {
      let re = 0
      let im = 0
      for (let index = 0; index < n; index += 1) {
        const angle = (2 * Math.PI * k * index) / n
        re += centered[index] * Math.cos(angle)
        im -= centered[index] * Math.sin(angle)
      }
      const amplitude = (2 * Math.sqrt(re * re + im * im)) / n
      if (!best || amplitude > best.amplitude) {
        best = { amplitude, phaseDeg: normalizeDegree((Math.atan2(im, re) * 180) / Math.PI) }
      }
    }
    return best
  }

  function normalizeDegree(value) {
    if (!Number.isFinite(Number(value))) return 0
    return ((Number(value) % 360) + 360) % 360
  }

  function formatABMark(points) {
    if (!points || !points.a || !points.b) return ''
    return `a: ${formatNumber(points.a.x)}ms ${formatNumber(points.a.y)}uv b: ${formatNumber(points.b.x)}ms ${formatNumber(points.b.y)}uv`
  }

  function formatNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '0.0'
  }

  function gaussian(x, center, spread) {
    return Math.exp(-((x - center) ** 2) / (2 * spread ** 2))
  }

  const ERG_PROTOCOLS = buildErgProtocols()

  function buildErgProtocols() {
    const protocols = []
    let id = 1
    ;[0.01, 0.03, 0.1, 0.3, 1, 3].forEach((flashCd) => {
      protocols.push({
        id: String(id),
        mode: 'FERG',
        family: 'dRod',
        condition: `FERG(${id})_dRod · b白色光:${formatFlash(flashCd)}cd.m-2,${flashCd === 3 ? 4 : 5}ms`,
        scale: 0.72 + Math.log10(flashCd * 100 + 1) * 0.18,
      })
      id += 1
    })
    ;[3, 20, 200, 600, 1000, 2000].forEach((flashCd) => {
      protocols.push({
        id: String(id),
        mode: 'FERG',
        family: 'dMax',
        condition: `FERG(${id})_dMax · ${flashCd >= 1000 ? 'f' : 'b'}白色光:${formatFlash(flashCd)}cd.m-2,5ms`,
        scale: 0.76 + Math.log10(flashCd + 1) * 0.1,
      })
      id += 1
      protocols.push({
        id: String(id),
        mode: 'dOps',
        family: 'dOps',
        condition: `FERG(${id})_dOps · ${flashCd >= 1000 ? 'f' : 'b'}白色光:${formatFlash(flashCd)}cd.m-2,5ms`,
        scale: 0.58 + Math.log10(flashCd + 1) * 0.075,
      })
      id += 1
    })
    ;[600, 1000, 2000].forEach((flashCd) => {
      protocols.push({
        id: String(id),
        mode: 'FERG',
        family: 'lCone',
        condition: `FERG(${id})_lCone · ${flashCd >= 1000 ? 'f' : 'b'}白色光:${formatFlash(flashCd)}cd.m-2,5ms`,
        scale: 0.48 + Math.log10(flashCd + 1) * 0.055,
      })
      id += 1
      protocols.push({
        id: String(id),
        mode: 'Flicker',
        family: 'lFlicker',
        condition: `FERG(${id})_lFlicker · ${flashCd >= 1000 ? 'f' : 'b'}白色光:${formatFlash(flashCd)}cd.m-2,5ms`,
        scale: 0.4 + Math.log10(flashCd + 1) * 0.055,
      })
      id += 1
    })
    return protocols
  }

  function formatFlash(value) {
    return Number(value).toFixed(value < 1 ? 2 : 1)
  }

  function makeSample(fileIndex, protocolIndex, cohort, amplitude, shift, sourceName, subjectId, protocol) {
    const seed = fileIndex * 17 + protocolIndex * 5
    const right = makeTrace(amplitude * protocol.scale * (1 + fileIndex * 0.012), shift, seed, protocol)
    const left = makeTrace(amplitude * protocol.scale * (0.96 + fileIndex * 0.01), shift + 1.5, seed + 3, protocol)
    const sample = {
      id: `${subjectId.toLowerCase()}-${String(protocol.id).padStart(2, '0')}-${protocol.family.toLowerCase()}`,
      label: `${subjectId} · ${protocol.family}`,
      subjectId,
      acquisitionId: protocol.id,
      cohort,
      mode: protocol.mode,
      condition: protocol.condition,
      sourceName,
      included: true,
      metadata: {
        animalId: subjectId,
        eye: 'OU',
        operator: 'Demo',
        date: '2026-06-27',
        sourcePath: sourceName,
        rightName: protocol.family,
        leftName: protocol.family,
      },
      traces: { right, left },
      machineMarks: machineMarksForProtocol(protocol, right, left),
      corrections: {
        amplitudeScale: cohort === 'ko' ? 0.98 : 1,
        latencyShiftMs: cohort === 'ko' ? 1.2 : 0,
      },
      qc: [],
    }
    sample.metrics = { raw: metrics.deriveRawMetrics(sample) }
    sample.qc = buildQc(sample)
    return sample
  }

  function buildQc(sample) {
    const items = []
    const amplitude = sample.metrics && sample.metrics.raw ? sample.metrics.raw.amplitudeUv : null
    if (Number.isFinite(amplitude) && amplitude < 80) {
      items.push({ level: 'warn', message: 'Low response amplitude; inspect baseline and inclusion.' })
    }
    if (!sample.traces || !sample.traces.right || !sample.traces.left) {
      items.push({ level: 'warn', message: 'Missing bilateral trace data.' })
    }
    if (!items.length) items.push({ level: 'ok', message: 'No baseline QC warning for this sample.' })
    return items
  }

  function createDemoProject() {
    const sources = [
      ...Array.from({ length: 4 }, (_item, index) => ({ cohort: 'ctrl', index: index + 1, amplitude: 188 + index * 5, shift: 0 })),
      ...Array.from({ length: 4 }, (_item, index) => ({ cohort: 'ko', index: index + 1, amplitude: 122 + index * 4, shift: 7 })),
    ]
    const samples = sources.flatMap((source, sourceIndex) => {
      const subjectId = `${source.cohort}-${String(source.index).padStart(2, '0')}`
      const sourceName = `demo-${source.cohort}-${source.index}_FERG.xlsx`
      return ERG_PROTOCOLS.map((protocol, protocolIndex) =>
        makeSample(sourceIndex + 1, protocolIndex + 1, source.cohort, source.amplitude, source.shift, sourceName, subjectId, protocol)
      )
    })
    return {
      schema: 'erg-viewer-v2-project',
      version: 1,
      title: 'Demo ERG group project',
      createdAt: new Date().toISOString(),
      samples,
      settings: {
        activeStep: 'Intake',
        selectedSampleId: samples[0].id,
        metricKey: 'bAmplitudeUv',
        metricVersion: 'raw',
      },
    }
  }

  return {
    createDemoProject,
    makeTrace,
    buildQc,
  }
})
