;(function initManualPicks(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.ERGv2ManualPicks = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const ORDINARY_KEYS = ['a', 'b', 'N1', 'P1', 'N2', 'P2', 'flickerTrough', 'flickerPeak']
  const LABELS = {
    a: 'a',
    b: 'b',
    N1: 'N1',
    P1: 'P1',
    N2: 'N2',
    P2: 'P2',
    flickerTrough: 'Flicker trough',
    flickerPeak: 'Flicker peak',
  }

  function cloneManualPoints(manualPoints) {
    const source = manualPoints && typeof manualPoints === 'object' ? manualPoints : {}
    return {
      right: cloneManualSide(source.right),
      left: cloneManualSide(source.left),
    }
  }

  function cloneManualSide(side) {
    const out = {}
    ORDINARY_KEYS.forEach((key) => {
      if (side && side[key]) out[key] = normalizePoint(side[key])
    })
    const ops = Array.isArray(side && side.ops) ? side.ops : []
    out.ops = Array.from({ length: 5 }, (_item, index) => {
      const item = ops[index] || {}
      return {
        ...(item.peak ? { peak: normalizePoint(item.peak) } : {}),
        ...(item.valley ? { valley: normalizePoint(item.valley) } : {}),
      }
    })
    return out
  }

  function setManualPoint(manualPoints, side, key, point) {
    const next = cloneManualPoints(manualPoints)
    if (!next[side]) return next
    const normalized = normalizePoint(point)
    if (!isFinitePoint(normalized)) return next
    if (key.startsWith('op')) {
      const match = key.match(/^op([1-5])-(peak|valley)$/)
      if (!match) return next
      const index = Number(match[1]) - 1
      const kind = match[2]
      next[side].ops[index] = {
        ...(next[side].ops[index] || {}),
        [kind]: normalized,
      }
      return next
    }
    next[side][key] = normalized
    return next
  }

  function clearManualPoint(manualPoints, side, key) {
    const next = cloneManualPoints(manualPoints)
    if (!next[side]) return next
    if (key.startsWith('op')) {
      const match = key.match(/^op([1-5])-(peak|valley)$/)
      if (!match) return next
      const index = Number(match[1]) - 1
      const kind = match[2]
      next[side].ops[index] = { ...(next[side].ops[index] || {}) }
      delete next[side].ops[index][kind]
      return next
    }
    delete next[side][key]
    return next
  }

  function nudgeManualPoint(manualPoints, side, key, delta) {
    const current = getManualPoint(manualPoints, side, key)
    if (!current) return cloneManualPoints(manualPoints)
    return setManualPoint(manualPoints, side, key, {
      x: current.x + Number(delta && delta.x ? delta.x : 0),
      y: current.y + Number(delta && delta.y ? delta.y : 0),
    })
  }

  function getManualPoint(manualPoints, side, key) {
    const source = manualPoints && manualPoints[side] ? manualPoints[side] : {}
    if (key.startsWith('op')) {
      const match = key.match(/^op([1-5])-(peak|valley)$/)
      if (!match) return null
      const item = Array.isArray(source.ops) ? source.ops[Number(match[1]) - 1] : null
      return isFinitePoint(item && item[match[2]]) ? normalizePoint(item[match[2]]) : null
    }
    return isFinitePoint(source[key]) ? normalizePoint(source[key]) : null
  }

  function manualMarkers(manualSide) {
    if (!manualSide) return []
    const points = []
    ORDINARY_KEYS.forEach((key) => {
      const point = manualSide[key]
      if (isFinitePoint(point)) points.push({ ...normalizePoint(point), key, label: LABELS[key] || key })
    })
    ;(manualSide.ops || []).forEach((item, index) => {
      if (isFinitePoint(item && item.peak)) {
        points.push({ ...normalizePoint(item.peak), key: `op${index + 1}-peak`, label: `OP${index + 1}P` })
      }
      if (isFinitePoint(item && item.valley)) {
        points.push({
          ...normalizePoint(item.valley),
          key: `op${index + 1}-valley`,
          label: `OP${index + 1}V`,
        })
      }
    })
    return points
  }

  function countManualPoints(manualPoints) {
    return ['right', 'left'].reduce(
      (total, side) => total + manualMarkers(manualPoints && manualPoints[side]).length,
      0
    )
  }

  function normalizePoint(point) {
    return { x: Number(point && point.x), y: Number(point && point.y) }
  }

  function isFinitePoint(point) {
    return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
  }

  return {
    cloneManualPoints,
    setManualPoint,
    clearManualPoint,
    nudgeManualPoint,
    getManualPoint,
    manualMarkers,
    countManualPoints,
    normalizePoint,
    isFinitePoint,
  }
})
