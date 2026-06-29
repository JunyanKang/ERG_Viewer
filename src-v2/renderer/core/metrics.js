;(function initMetrics(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.ERGv2Metrics = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  function finite(value, fallback) {
    const number = Number(value)
    return Number.isFinite(number) ? number : fallback
  }

  function mean(values) {
    const clean = values.map(Number).filter(Number.isFinite)
    if (!clean.length) return null
    return clean.reduce((sum, value) => sum + value, 0) / clean.length
  }

  function min(values) {
    const clean = values.map(Number).filter(Number.isFinite)
    return clean.length ? Math.min(...clean) : null
  }

  function max(values) {
    const clean = values.map(Number).filter(Number.isFinite)
    return clean.length ? Math.max(...clean) : null
  }

  function traceAmplitude(trace) {
    if (!trace || !Array.isArray(trace.y)) return null
    const low = min(trace.y)
    const high = max(trace.y)
    return low === null || high === null ? null : high - low
  }

  function numbers(value) {
    return (
      String(value || '')
        .match(/[+-]?\d+(?:\.\d+)?/g)
        ?.map(Number)
        .filter(Number.isFinite) || []
    )
  }

  function parseABMark(mark) {
    const text = String(mark || '')
    const bIndex = text.toLowerCase().indexOf('b:')
    if (bIndex < 0) return null
    const a = numbers(text.slice(0, bIndex))
    const b = numbers(text.slice(bIndex + 2))
    if (a.length < 2 || b.length < 2) return null
    return {
      a: { x: a[0], y: a[1] },
      b: { x: b[0], y: b[1] },
    }
  }

  function parseFlickerMark(mark) {
    const text = String(mark || '')
    if (!text.trim()) return null
    const amplitude = firstNumberAfter(text, /(幅值|amplitude|amp)\s*[:：]?\s*/i)
    const phase = firstNumberAfter(text, /(相位|phase)\s*[:：]?\s*/i)
    const values = numbers(text)
    const out = {}
    if (Number.isFinite(amplitude)) out.amplitude = amplitude
    else if (values.length) out.amplitude = values[0]
    if (Number.isFinite(phase)) out.phase = normalizeDegree(phase)
    else if (values.length > 1) out.phase = normalizeDegree(values[1])
    return Number.isFinite(out.amplitude) || Number.isFinite(out.phase) ? out : null
  }

  function firstNumberAfter(text, labelPattern) {
    const label = String(text || '').match(labelPattern)
    if (!label) return null
    const value = String(text).slice(label.index + label[0].length).match(/[+-]?\d+(?:\.\d+)?/)
    return value ? Number(value[0]) : null
  }

  function parseFVEPMark(mark) {
    const out = {}
    const re = /(N|P)\s*(\d)\s*[:：]?\s*([+-]?\d+(?:\.\d+)?)\s*ms\s*([+-]?\d+(?:\.\d+)?)\s*(?:[μu]?[vV]?)?/g
    let match
    while ((match = re.exec(String(mark || '')))) {
      out[`${match[1].toUpperCase()}${match[2]}`] = {
        x: Number(match[3]),
        y: Number(match[4]),
      }
    }
    return out
  }

  function peakLatency(trace, polarity) {
    if (!trace || !Array.isArray(trace.x) || !Array.isArray(trace.y) || !trace.y.length) return null
    const compare =
      polarity === 'negative'
        ? (candidate, current) => candidate < current
        : (candidate, current) => candidate > current
    let bestIndex = 0
    for (let index = 1; index < trace.y.length; index += 1) {
      if (compare(trace.y[index], trace.y[bestIndex])) bestIndex = index
    }
    return finite(trace.x[bestIndex], null)
  }

  function deriveRawMetrics(sample) {
    const fromMarks = deriveMachineMarkedMetrics(sample)
    const mode = String((sample && sample.mode) || '').toLowerCase()
    if (mode === 'flicker') {
      const waveform = deriveFlickerWaveformMetrics(sample) || {}
      const merged = { ...waveform, ...(fromMarks || {}) }
      if (!Number.isFinite(merged.flickerAmplitudeUv) && Number.isFinite(waveform.flickerWaveformAmplitudeUv)) {
        merged.flickerAmplitudeUv = waveform.flickerWaveformAmplitudeUv
      }
      if (!Number.isFinite(merged.flickerPhaseDeg) && Number.isFinite(waveform.flickerWaveformPhaseDeg)) {
        merged.flickerPhaseDeg = waveform.flickerWaveformPhaseDeg
      }
      if (!Number.isFinite(merged.amplitudeUv) && Number.isFinite(merged.flickerAmplitudeUv)) {
        merged.amplitudeUv = merged.flickerAmplitudeUv
      }
      return Object.values(merged).some(Number.isFinite) ? merged : {}
    }
    if (fromMarks) return fromMarks
    const right = sample && sample.traces ? sample.traces.right : null
    const left = sample && sample.traces ? sample.traces.left : null
    const amplitudeValues = [traceAmplitude(right), traceAmplitude(left)].filter(Number.isFinite)
    const aLatencyValues = [peakLatency(right, 'negative'), peakLatency(left, 'negative')].filter(
      Number.isFinite
    )
    const bLatencyValues = [peakLatency(right, 'positive'), peakLatency(left, 'positive')].filter(
      Number.isFinite
    )
    const amplitude = mean(amplitudeValues)
    const aLatency = mean(aLatencyValues)
    const bLatency = mean(bLatencyValues)
    return {
      amplitudeUv: round(amplitude, 2),
      aLatencyMs: round(aLatency, 2),
      bLatencyMs: round(bLatency, 2),
      baRatio: round(
        amplitude && amplitude > 0
          ? amplitude /
              Math.max(
                Math.abs(min([right && min(right.y), left && min(left.y)].filter(Number.isFinite))) || 1,
                1
              )
          : null,
        3
      ),
    }
  }

  function deriveMachineMarkedMetrics(sample) {
    const marks = sample && sample.machineMarks ? sample.machineMarks : null
    if (!marks) return null
    const mode = String((sample && sample.mode) || '').toLowerCase()
    if (mode === 'fvep') return summarizeFVEPPoints([parseFVEPMark(marks.right), parseFVEPMark(marks.left)])
    if (mode === 'dops') {
      const values = [numbers(marks.right)[0], numbers(marks.left)[0]].filter(Number.isFinite)
      if (!values.length) return null
      return { sumOpAmplitudeUv: round(mean(values), 2), amplitudeUv: round(mean(values), 2) }
    }
    if (mode === 'flicker') {
      const flicker = summarizeFlickerMarks([parseFlickerMark(marks.right), parseFlickerMark(marks.left)])
      if (flicker) return flicker
      const points = [parseABMark(marks.right), parseABMark(marks.left)]
        .filter(Boolean)
        .map((point) => ({ flickerTrough: point.a, flickerPeak: point.b }))
      return points.length ? summarizeFlickerPoints(points) : null
    }
    const points = [parseABMark(marks.right), parseABMark(marks.left)].filter(Boolean)
    if (!points.length) return null
    return summarizeABPoints(points)
  }

  function summarizeFlickerMarks(marks) {
    const clean = marks.filter(Boolean)
    const amplitudes = clean.map((item) => item.amplitude).filter(Number.isFinite)
    const phases = clean.map((item) => item.phase).filter(Number.isFinite)
    if (!amplitudes.length && !phases.length) return null
    const out = {}
    if (amplitudes.length) {
      out.flickerAmplitudeUv = round(mean(amplitudes), 2)
      out.amplitudeUv = out.flickerAmplitudeUv
    }
    if (phases.length) out.flickerPhaseDeg = round(meanDegrees(phases), 2)
    return out
  }

  function deriveFlickerWaveformMetrics(sample) {
    const right = sample && sample.traces ? sample.traces.right : null
    const left = sample && sample.traces ? sample.traces.left : null
    const spectra = [dominantFourier(right), dominantFourier(left)].filter(Boolean)
    if (!spectra.length) return null
    const amplitudes = spectra.map((item) => item.amplitude).filter(Number.isFinite)
    const phases = spectra.map((item) => item.phaseDeg).filter(Number.isFinite)
    const frequencies = spectra.map((item) => item.frequencyHz).filter(Number.isFinite)
    const peakTimes = spectra.map((item) => item.peakTimeMs).filter(Number.isFinite)
    const out = {}
    if (amplitudes.length) out.flickerWaveformAmplitudeUv = round(mean(amplitudes), 2)
    if (phases.length) out.flickerWaveformPhaseDeg = round(meanDegrees(phases), 2)
    if (frequencies.length) out.flickerDominantFrequencyHz = round(mean(frequencies), 2)
    if (peakTimes.length) out.flickerImplicitTimeMs = round(mean(peakTimes), 2)
    return Object.values(out).some(Number.isFinite) ? out : null
  }

  function dominantFourier(trace) {
    if (!trace || !Array.isArray(trace.x) || !Array.isArray(trace.y)) return null
    const values = trace.y.map(Number).filter(Number.isFinite)
    const xValues = trace.x.map(Number).filter(Number.isFinite)
    const n = Math.min(values.length, xValues.length)
    if (n < 8) return null
    const y = values.slice(0, n)
    const x = xValues.slice(0, n)
    const baseline = mean(y) || 0
    const centered = y.map((value) => value - baseline)
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
      if (!best || amplitude > best.amplitude) best = { k, amplitude, phaseDeg: normalizeDegree((Math.atan2(im, re) * 180) / Math.PI) }
    }
    if (!best) return null
    const durationMs = Math.max(...x) - Math.min(...x)
    const frequencyHz = durationMs > 0 ? best.k / (durationMs / 1000) : null
    let peakIndex = 0
    for (let index = 1; index < n; index += 1) {
      if (y[index] > y[peakIndex]) peakIndex = index
    }
    return {
      amplitude: best.amplitude,
      phaseDeg: best.phaseDeg,
      frequencyHz,
      peakTimeMs: x[peakIndex],
    }
  }

  function summarizeABPoints(points) {
    const aLatency = []
    const aAmplitude = []
    const bLatency = []
    const bAmplitude = []
    points.forEach((point) => {
      if (point.a && Number.isFinite(Number(point.a.x))) aLatency.push(Number(point.a.x))
      if (point.a && Number.isFinite(Number(point.a.y))) aAmplitude.push(Number(point.a.y))
      if (point.b && Number.isFinite(Number(point.b.x))) bLatency.push(Number(point.b.x))
      if (point.b && Number.isFinite(Number(point.b.y))) {
        const base = point.a && Number.isFinite(Number(point.a.y)) ? Number(point.a.y) : 0
        bAmplitude.push(Number(point.b.y) - base)
      }
    })
    const bAmp = mean(bAmplitude)
    const aAmp = mean(aAmplitude)
    return {
      amplitudeUv: round(bAmp, 2),
      aLatencyMs: round(mean(aLatency), 2),
      aAmplitudeUv: round(aAmp, 2),
      bLatencyMs: round(mean(bLatency), 2),
      bAmplitudeUv: round(bAmp, 2),
      baRatio: round(Number.isFinite(bAmp) && Number.isFinite(aAmp) ? Math.abs(bAmp / aAmp) : null, 3),
    }
  }

  function summarizeFVEPPoints(points) {
    const labels = ['N1', 'P1', 'N2', 'P2']
    const out = {}
    labels.forEach((label) => {
      const latency = points.map((point) => point && point[label] && point[label].x).filter(Number.isFinite)
      const amplitude = points.map((point) => point && point[label] && point[label].y).filter(Number.isFinite)
      if (latency.length) out[`${label.toLowerCase()}LatencyMs`] = round(mean(latency), 2)
      if (amplitude.length) out[`${label.toLowerCase()}AmplitudeUv`] = round(mean(amplitude), 2)
    })
    const pairAmplitude = (a, b) => {
      const values = points
        .map((point) =>
          point && point[a] && point[b] && Number.isFinite(point[a].y) && Number.isFinite(point[b].y)
            ? point[a].y - point[b].y
            : null
        )
        .filter(Number.isFinite)
      return values.length ? round(mean(values), 2) : null
    }
    out.p1n1AmplitudeUv = pairAmplitude('P1', 'N1')
    out.p1n2AmplitudeUv = pairAmplitude('P1', 'N2')
    out.p2n2AmplitudeUv = pairAmplitude('P2', 'N2')
    out.amplitudeUv = out.p1n1AmplitudeUv || out.p1n2AmplitudeUv || out.p2n2AmplitudeUv || null
    return Object.values(out).some(Number.isFinite) ? out : null
  }

  function summarizeFlickerPoints(points, sourceMetrics) {
    const rows = points
      .map((side) => {
        const trough = side && (side.flickerTrough || side.a)
        const peak = side && (side.flickerPeak || side.b)
        if (!trough || !peak) return null
        const amplitude = Number(peak.y) - Number(trough.y)
        return {
          amplitude,
          peakTime: Number(peak.x),
        }
      })
      .filter((row) => row && Number.isFinite(row.amplitude))
    if (!rows.length) return {}
    const amplitude = round(mean(rows.map((row) => row.amplitude)), 2)
    const peakTime = round(mean(rows.map((row) => row.peakTime).filter(Number.isFinite)), 2)
    const out = {
      flickerAmplitudeUv: amplitude,
      amplitudeUv: amplitude,
      flickerImplicitTimeMs: peakTime,
    }
    const frequencyHz = Number(sourceMetrics && sourceMetrics.flickerDominantFrequencyHz)
    if (Number.isFinite(frequencyHz) && Number.isFinite(peakTime) && frequencyHz > 0) {
      out.flickerPhaseDeg = round(normalizeDegree((peakTime / (1000 / frequencyHz)) * 360), 2)
    }
    return out
  }

  function manualPoints(corrections) {
    const manual = corrections && corrections.manualPoints ? corrections.manualPoints : {}
    return {
      right: manual.right && typeof manual.right === 'object' ? manual.right : {},
      left: manual.left && typeof manual.left === 'object' ? manual.left : {},
    }
  }

  function deriveManualMetrics(sampleOrRaw, corrections) {
    const sample = sampleOrRaw && sampleOrRaw.traces ? sampleOrRaw : null
    const sourceCorrections = corrections || (sample && sample.corrections) || {}
    const points = manualPoints(sourceCorrections)
    const mode = String((sample && sample.mode) || sourceCorrections.mode || '').toLowerCase()
    if (mode === 'fvep') return summarizeFVEPPoints([points.right, points.left].filter(Boolean)) || {}
    if (mode === 'dops') {
      const opMetrics = summarizeOpsByComponent([points.right, points.left])
      return opMetrics
    }
    if (mode === 'flicker') {
      const flickerPoints = [points.right, points.left].filter(
        (side) => side && (side.flickerTrough || side.flickerPeak || side.a || side.b)
      )
      return flickerPoints.length ? summarizeFlickerPoints(flickerPoints, sampleOrRaw) : {}
    }
    const abPoints = [points.right, points.left]
      .filter((side) => side && (side.a || side.b))
      .map((side) => ({ a: side.a, b: side.b }))
    return abPoints.length ? summarizeABPoints(abPoints) : {}
  }

  function summarizeOpsByComponent(sides) {
    const byIndex = Array.from({ length: 5 }, () => [])
    const sideTotals = []
    ;(sides || []).forEach((side) => {
      const ops = Array.isArray(side && side.ops) ? side.ops : []
      let sideTotal = 0
      ops.forEach((item, index) => {
        if (
          index < byIndex.length &&
          item &&
          item.peak &&
          item.valley &&
          Number.isFinite(Number(item.peak.y)) &&
          Number.isFinite(Number(item.valley.y))
        ) {
          const amplitude = Number(item.peak.y) - Number(item.valley.y)
          byIndex[index].push(amplitude)
          sideTotal += amplitude
        }
      })
      if (sideTotal) sideTotals.push(sideTotal)
    })
    const out = {}
    const componentSums = []
    byIndex.forEach((values, index) => {
      if (!values.length) return
      const value = round(mean(values), 2)
      out[`op${index + 1}AmplitudeUv`] = value
      componentSums.push(value)
    })
    if (sideTotals.length) {
      out.sumOpAmplitudeUv = round(mean(sideTotals), 2)
      out.amplitudeUv = out.sumOpAmplitudeUv
    }
    return out
  }

  function correctedMetrics(raw, corrections) {
    const source = raw || {}
    return { ...source, ...deriveManualMetrics(source, corrections) }
  }

  function summarizeGroups(samples, metricKey, version) {
    const groups = new Map()
    samples
      .filter((sample) => sample.included !== false)
      .forEach((sample) => {
        const cohort = sample.cohort || 'Unassigned'
        const metrics =
          version === 'corrected'
            ? correctedMetrics(sample.metrics && sample.metrics.raw, {
                ...sample.corrections,
                mode: sample.mode,
              })
            : (sample.metrics && sample.metrics.raw) || {}
        const value = Number(metrics[metricKey])
        if (!Number.isFinite(value)) return
        if (!groups.has(cohort)) groups.set(cohort, [])
        groups.get(cohort).push(value)
      })
    return Array.from(groups.entries()).map(([cohort, values]) => ({
      cohort,
      n: values.length,
      mean: round(mean(values), 3),
      min: round(min(values), 3),
      max: round(max(values), 3),
    }))
  }

  function buildSourceRows(samples, metricKey, version) {
    return samples.map((sample) => {
      const raw = sample.metrics && sample.metrics.raw ? sample.metrics.raw : deriveRawMetrics(sample)
      const corrected = correctedMetrics(raw, { ...sample.corrections, mode: sample.mode })
      const metrics = version === 'corrected' ? corrected : raw
      return {
        sampleId: sample.id,
        subjectId: sample.subjectId,
        acquisitionId: sample.acquisitionId,
        sample: sample.label,
        cohort: sample.cohort,
        included: sample.included !== false,
        mode: sample.mode,
        condition: sample.condition,
        metric: metricKey,
        version,
        value: metrics[metricKey],
      }
    })
  }

  function round(value, digits) {
    if (!Number.isFinite(value)) return null
    const factor = 10 ** finite(digits, 0)
    return Math.round(value * factor) / factor
  }

  function normalizeDegree(value) {
    if (!Number.isFinite(Number(value))) return null
    return ((Number(value) % 360) + 360) % 360
  }

  function meanDegrees(values) {
    const clean = values.map(Number).filter(Number.isFinite)
    if (!clean.length) return null
    const vector = clean.reduce(
      (acc, value) => {
        const radians = (value * Math.PI) / 180
        acc.x += Math.cos(radians)
        acc.y += Math.sin(radians)
        return acc
      },
      { x: 0, y: 0 }
    )
    return normalizeDegree((Math.atan2(vector.y, vector.x) * 180) / Math.PI)
  }

  return {
    mean,
    traceAmplitude,
    peakLatency,
    parseABMark,
    parseFlickerMark,
    parseFVEPMark,
    deriveRawMetrics,
    deriveMachineMarkedMetrics,
    deriveManualMetrics,
    correctedMetrics,
    summarizeGroups,
    buildSourceRows,
    round,
  }
})
