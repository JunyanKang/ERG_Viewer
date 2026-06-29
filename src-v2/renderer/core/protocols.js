;(function initProtocols(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.ERGv2Protocols = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const ENDPOINTS = [
    endpoint(
      'amplitudeUv',
      'Protocol default amp',
      'µV',
      ['ERG', 'FVEP'],
      ['FERG', 'dOps', 'Flicker', 'FVEP'],
      'Protocol-default amp; prefer a named endpoint when available.',
      { visible: false }
    ),
    endpoint('aAmplitudeUv', 'a-wave amp', 'µV', ['ERG'], ['FERG'], 'a-wave trough amp, a photoreceptor-dominant ERG endpoint.'),
    endpoint('bAmplitudeUv', 'b-wave amp', 'µV', ['ERG'], ['FERG'], 'b-wave amp from a-wave trough or baseline to b-wave peak.'),
    endpoint('aLatencyMs', 'a-wave implicit time', 'ms', ['ERG'], ['FERG'], 'a-wave implicit time from stimulus onset to trough.'),
    endpoint('bLatencyMs', 'b-wave implicit time', 'ms', ['ERG'], ['FERG'], 'b-wave implicit time from stimulus onset to peak.'),
    endpoint(
      'baRatio',
      'b/a amp ratio',
      'ratio',
      ['ERG'],
      ['FERG'],
      'b-wave to a-wave amp ratio for photoreceptor vs post-receptoral interpretation.',
      { visible: false }
    ),
    endpoint('sumOpAmplitudeUv', 'Summed OP amp', 'µV', ['ERG'], ['dOps'], 'Sum of oscillatory-potential peak-to-valley amps.'),
    endpoint('op1AmplitudeUv', 'OP1 amp', 'µV', ['ERG'], ['dOps'], 'OP1 peak-to-valley amp from manual picks.'),
    endpoint('op2AmplitudeUv', 'OP2 amp', 'µV', ['ERG'], ['dOps'], 'OP2 peak-to-valley amp from manual picks.'),
    endpoint('op3AmplitudeUv', 'OP3 amp', 'µV', ['ERG'], ['dOps'], 'OP3 peak-to-valley amp from manual picks.'),
    endpoint('op4AmplitudeUv', 'OP4 amp', 'µV', ['ERG'], ['dOps'], 'OP4 peak-to-valley amp from manual picks.'),
    endpoint('op5AmplitudeUv', 'OP5 amp', 'µV', ['ERG'], ['dOps'], 'OP5 peak-to-valley amp from manual picks.'),
    endpoint('flickerAmplitudeUv', 'Flicker amp', 'µV', ['ERG'], ['Flicker'], 'Flicker response amp from machine amp marks, manual trough/peak picks, or waveform Fourier recomputation.'),
    endpoint('flickerPhaseDeg', 'Flicker phase', 'deg', ['ERG'], ['Flicker'], 'Flicker response phase from machine phase marks or waveform Fourier recomputation.'),
    endpoint('flickerImplicitTimeMs', 'Flicker peak time', 'ms', ['ERG'], ['Flicker'], 'Time of the dominant flicker response peak in the reviewed trace window.'),
    endpoint('flickerWaveformAmplitudeUv', 'Fourier amp', 'µV', ['ERG'], ['Flicker'], 'Waveform-derived dominant Fourier amp for independent review of Flicker ERG marks.'),
    endpoint('flickerWaveformPhaseDeg', 'Fourier phase', 'deg', ['ERG'], ['Flicker'], 'Waveform-derived dominant Fourier phase for independent review of Flicker ERG marks.'),
    endpoint('p1n1AmplitudeUv', 'P1-N1 amp', 'µV', ['FVEP'], ['FVEP'], 'Flash VEP peak-to-trough amp between N1 and P1.'),
    endpoint('p1n2AmplitudeUv', 'P1-N2 amp', 'µV', ['FVEP'], ['FVEP'], 'Flash VEP P1-to-N2 peak-to-trough amp.'),
    endpoint('p2n2AmplitudeUv', 'P2-N2 amp', 'µV', ['FVEP'], ['FVEP'], 'Flash VEP P2-to-N2 peak-to-trough amp.'),
    endpoint('n1LatencyMs', 'N1 latency', 'ms', ['FVEP'], ['FVEP'], 'Flash VEP N1 latency.'),
    endpoint('p1LatencyMs', 'P1 latency', 'ms', ['FVEP'], ['FVEP'], 'Flash VEP P1 latency.'),
    endpoint('n2LatencyMs', 'N2 latency', 'ms', ['FVEP'], ['FVEP'], 'Flash VEP N2 latency.'),
    endpoint('p2LatencyMs', 'P2 latency', 'ms', ['FVEP'], ['FVEP'], 'Flash VEP P2 latency.'),
  ]

  const ENDPOINT_BY_KEY = Object.fromEntries(ENDPOINTS.map((item) => [item.key, item]))

  function endpoint(key, label, unit, sourceTypes, modes, note, options) {
    return { key, label, unit, sourceTypes, modes, note, visible: !(options && options.visible === false) }
  }

  function metricEntries() {
    return ENDPOINTS.filter((item) => item.visible !== false).map((item) => [item.key, item.label])
  }

  function metricKeys() {
    return ENDPOINTS.filter((item) => item.visible !== false).map((item) => item.key)
  }

  function metricUnits() {
    return Object.fromEntries(ENDPOINTS.map((item) => [item.key, item.unit]))
  }

  function metricMeta(key) {
    return ENDPOINT_BY_KEY[key] || null
  }

  function metricBaseLabel(key) {
    const meta = metricMeta(key)
    return meta ? meta.label : key
  }

  function metricUnit(key) {
    const meta = metricMeta(key)
    return meta && meta.unit ? meta.unit : ''
  }

  function metricLabel(key) {
    const label = metricBaseLabel(key)
    const unit = metricUnit(key)
    return unit ? `${label} (${unit})` : label
  }

  function metricNote(key) {
    const meta = metricMeta(key)
    return meta && meta.note ? meta.note : ''
  }

  function metricOptionsForPlan(optionKeys, plan) {
    const sourceType = plan && plan.sourceType && plan.sourceType !== 'All' ? plan.sourceType : ''
    const protocolMode = plan && plan.protocolMode && plan.protocolMode !== 'All' ? plan.protocolMode : ''
    const keys = (Array.isArray(optionKeys) && optionKeys.length ? optionKeys : metricKeys()).filter(
      (key) => {
        const meta = metricMeta(key)
        return meta && meta.visible !== false
      }
    )
    const filtered = keys.filter((key) => metricMatchesPlan(key, sourceType, protocolMode))
    return filtered.length ? filtered : keys
  }

  function compatibleMetricForPlan(metricKey, plan) {
    const sourceType = plan && plan.sourceType && plan.sourceType !== 'All' ? plan.sourceType : ''
    const protocolMode = plan && plan.protocolMode && plan.protocolMode !== 'All' ? plan.protocolMode : ''
    const meta = metricMeta(metricKey)
    if (meta && meta.visible !== false && metricMatchesPlan(metricKey, sourceType, protocolMode)) return metricKey
    if (sourceType === 'FVEP' || protocolMode === 'FVEP') return 'p1n1AmplitudeUv'
    if (protocolMode === 'dOps') return 'sumOpAmplitudeUv'
    if (protocolMode === 'Flicker') return 'flickerAmplitudeUv'
    if (sourceType === 'ERG' || protocolMode === 'FERG') return 'bAmplitudeUv'
    return 'bAmplitudeUv'
  }

  function metricMatchesPlan(key, sourceType, protocolMode) {
    const meta = metricMeta(key)
    if (!meta) return false
    if (sourceType && !meta.sourceTypes.includes(sourceType)) return false
    if (protocolMode && !meta.modes.includes(protocolMode)) return false
    return true
  }

  function ergCompatibleMetric(metricKey) {
    const meta = metricMeta(metricKey)
    if (meta && meta.visible !== false && meta.sourceTypes.includes('ERG')) return metricKey
    return 'bAmplitudeUv'
  }

  function fvepCompatibleMetric(metricKey) {
    const meta = metricMeta(metricKey)
    if (meta && meta.visible !== false && meta.sourceTypes.includes('FVEP')) return metricKey
    return 'p1n1AmplitudeUv'
  }

  return {
    metricEntries,
    metricKeys,
    metricUnits,
    metricMeta,
    metricBaseLabel,
    metricUnit,
    metricLabel,
    metricNote,
    metricOptionsForPlan,
    compatibleMetricForPlan,
    ergCompatibleMetric,
    fvepCompatibleMetric,
  }
})
