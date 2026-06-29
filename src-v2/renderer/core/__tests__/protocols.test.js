const protocols = require('../protocols')

describe('ERG/FVEP scientific endpoint registry', () => {
  test('labels endpoints with scientific names and units', () => {
    expect(protocols.metricLabel('bAmplitudeUv')).toBe('b-wave amp (µV)')
    expect(protocols.metricLabel('flickerAmplitudeUv')).toBe('Flicker amp (µV)')
    expect(protocols.metricLabel('flickerPhaseDeg')).toBe('Flicker phase (deg)')
    expect(protocols.metricLabel('p1n1AmplitudeUv')).toBe('P1-N1 amp (µV)')
    expect(protocols.metricLabel('baRatio')).toBe('b/a amp ratio (ratio)')
  })

  test('hides generic fallback and b/a ratio endpoints from visible scientific selectors', () => {
    expect(protocols.metricKeys()).not.toContain('amplitudeUv')
    expect(protocols.metricKeys()).not.toContain('baRatio')
    expect(protocols.metricOptionsForPlan(['amplitudeUv', 'baRatio', 'bAmplitudeUv'], {
      sourceType: 'ERG',
      protocolMode: 'FERG',
    })).toEqual(['bAmplitudeUv'])
  })

  test('keeps ERG and FVEP endpoint selectors separate', () => {
    const erg = protocols.metricOptionsForPlan(protocols.metricKeys(), {
      sourceType: 'ERG',
      protocolMode: 'FERG',
    })
    const fvep = protocols.metricOptionsForPlan(protocols.metricKeys(), {
      sourceType: 'FVEP',
      protocolMode: 'FVEP',
    })

    expect(erg).toContain('bAmplitudeUv')
    expect(erg).not.toContain('p1n1AmplitudeUv')
    expect(fvep).toContain('p1n1AmplitudeUv')
    expect(fvep).not.toContain('bAmplitudeUv')
  })

  test('offers Flicker-specific endpoints without generic a/b-wave metrics', () => {
    const flicker = protocols.metricOptionsForPlan(protocols.metricKeys(), {
      sourceType: 'ERG',
      protocolMode: 'Flicker',
    })

    expect(flicker).toContain('flickerAmplitudeUv')
    expect(flicker).toContain('flickerPhaseDeg')
    expect(flicker).toContain('flickerWaveformAmplitudeUv')
    expect(flicker).not.toContain('aAmplitudeUv')
    expect(flicker).not.toContain('bAmplitudeUv')
  })

  test('selects compatible fallback metrics by source type', () => {
    expect(protocols.ergCompatibleMetric('p1n1AmplitudeUv')).toBe('bAmplitudeUv')
    expect(protocols.fvepCompatibleMetric('bAmplitudeUv')).toBe('p1n1AmplitudeUv')
    expect(protocols.ergCompatibleMetric('sumOpAmplitudeUv')).toBe('sumOpAmplitudeUv')
  })

  test('selects compatible fallback metrics by source and protocol plan', () => {
    expect(
      protocols.compatibleMetricForPlan('bAmplitudeUv', { sourceType: 'ERG', protocolMode: 'Flicker' })
    ).toBe('flickerAmplitudeUv')
    expect(
      protocols.compatibleMetricForPlan('p1n1AmplitudeUv', { sourceType: 'ERG', protocolMode: 'dOps' })
    ).toBe('sumOpAmplitudeUv')
    expect(
      protocols.compatibleMetricForPlan('flickerAmplitudeUv', { sourceType: 'FVEP', protocolMode: 'FVEP' })
    ).toBe('p1n1AmplitudeUv')
  })
})
