const manualPicks = require('../manual-picks')

describe('ERG Viewer v2 manual point helpers', () => {
  test('sets, nudges and clears an a/b-wave point without mutating the source', () => {
    const source = {}
    const withA = manualPicks.setManualPoint(source, 'right', 'a', { x: 30, y: -80 })
    const nudged = manualPicks.nudgeManualPoint(withA, 'right', 'a', { x: 0.1, y: 0.25 })

    expect(source.right).toBeUndefined()
    expect(manualPicks.getManualPoint(nudged, 'right', 'a')).toEqual({ x: 30.1, y: -79.75 })
    expect(manualPicks.countManualPoints(nudged)).toBe(1)

    const cleared = manualPicks.clearManualPoint(nudged, 'right', 'a')
    expect(manualPicks.getManualPoint(cleared, 'right', 'a')).toBeNull()
    expect(manualPicks.countManualPoints(cleared)).toBe(0)
  })

  test('tracks OP peak and valley markers separately', () => {
    const withPeak = manualPicks.setManualPoint({}, 'left', 'op3-peak', { x: 44, y: 35 })
    const withValley = manualPicks.setManualPoint(withPeak, 'left', 'op3-valley', { x: 48, y: -12 })
    const markers = manualPicks.manualMarkers(withValley.left)

    expect(markers).toEqual(
      expect.arrayContaining([
        { key: 'op3-peak', label: 'OP3P', x: 44, y: 35 },
        { key: 'op3-valley', label: 'OP3V', x: 48, y: -12 },
      ])
    )
    expect(manualPicks.countManualPoints(withValley)).toBe(2)
  })

  test('tracks Flicker trough and peak markers with scientific labels', () => {
    const withTrough = manualPicks.setManualPoint({}, 'right', 'flickerTrough', { x: 70, y: -18 })
    const withPeak = manualPicks.setManualPoint(withTrough, 'right', 'flickerPeak', { x: 95, y: 36 })
    const markers = manualPicks.manualMarkers(withPeak.right)

    expect(markers).toEqual(
      expect.arrayContaining([
        { key: 'flickerTrough', label: 'Flicker trough', x: 70, y: -18 },
        { key: 'flickerPeak', label: 'Flicker peak', x: 95, y: 36 },
      ])
    )
    expect(manualPicks.countManualPoints(withPeak)).toBe(2)
  })
})
