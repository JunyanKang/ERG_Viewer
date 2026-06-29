const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

function seededRandom(seed) {
  let x = Math.sin(seed * 999.17) * 10000
  return () => {
    x = Math.sin(x + seed * 12.9898) * 10000
    return x - Math.floor(x)
  }
}

function jitter(rand, amount) {
  return (rand() - 0.5) * 2 * amount
}

function pickBySeed(list, rand) {
  if (!Array.isArray(list) || list.length === 0) return 0
  return list[Math.abs(Math.floor(rand() * list.length)) % list.length]
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function stableTwin(seed, side) {
  return seededRandom(seed * 17 + (side === 'R' ? 11 : 19))
}

function demoWaveform(kind, scale, seed, n) {
  const rand = seededRandom(seed)
  const latency = jitter(rand, 0.025)
  const widthJ = 1 + jitter(rand, 0.16)
  const drift = jitter(rand, 16)
  const slope = jitter(rand, 22)
  const noiseAmp = 4 + rand() * 11
  const ripplePhase = rand() * Math.PI * 2
  const vals = []
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1)
    const tt = Math.max(0, Math.min(1, t + latency))
    const carrier =
      Math.sin((i + 1) * (seed + 3) * 0.37 + ripplePhase) * noiseAmp +
      Math.sin(i * 0.071 + seed) * noiseAmp * 0.45
    let y = carrier + drift + slope * (t - 0.5)
    if (kind === 'dRod') {
      y +=
        scale *
        (-(76 + jitter(rand, 12)) * Math.exp(-Math.pow((tt - 0.22) / (0.055 * widthJ), 2)) +
          (380 + jitter(rand, 45)) * Math.exp(-Math.pow((tt - 0.36) / (0.09 * widthJ), 2)) -
          (62 + jitter(rand, 18)) * Math.exp(-Math.pow((tt - 0.82) / 0.16, 2)))
    } else if (kind === 'dMax') {
      y +=
        scale *
        (-(160 + jitter(rand, 24)) * Math.exp(-Math.pow((tt - 0.18) / (0.05 * widthJ), 2)) +
          (760 + jitter(rand, 90)) * Math.exp(-Math.pow((tt - 0.3) / (0.08 * widthJ), 2)) +
          (145 + jitter(rand, 35)) * Math.exp(-Math.pow((tt - 0.42) / 0.08, 2)) -
          (88 + jitter(rand, 22)) * Math.exp(-Math.pow((tt - 0.78) / 0.18, 2)))
    } else if (kind === 'lCone') {
      y +=
        scale *
        (-(58 + jitter(rand, 10)) * Math.exp(-Math.pow((tt - 0.2) / (0.045 * widthJ), 2)) +
          (260 + jitter(rand, 38)) * Math.exp(-Math.pow((tt - 0.34) / (0.08 * widthJ), 2)) -
          (45 + jitter(rand, 12)) * Math.exp(-Math.pow((tt - 0.75) / 0.16, 2)))
    } else if (kind === 'dOps') {
      y +=
        scale *
        ((66 + jitter(rand, 12)) *
          Math.sin(tt * Math.PI * 38 + ripplePhase * 0.2) *
          Math.exp(-Math.pow((tt - 0.26) / (0.12 * widthJ), 2)) -
          10)
    } else if (kind === 'Flicker') {
      y +=
        scale *
        ((58 + jitter(rand, 8)) * Math.sin(t * Math.PI * 8 + seed * 0.2 + ripplePhase * 0.15) +
          (18 + jitter(rand, 4)) * Math.sin(t * Math.PI * 16 + ripplePhase))
    } else {
      y +=
        scale *
        (-(2 + jitter(rand, 0.5)) * Math.exp(-Math.pow((tt - 0.18) / (0.055 * widthJ), 2)) +
          (7 + jitter(rand, 1.4)) * Math.exp(-Math.pow((tt - 0.3) / (0.08 * widthJ), 2)) -
          (5 + jitter(rand, 1.2)) * Math.exp(-Math.pow((tt - 0.46) / 0.09, 2)))
    }
    vals.push(Number(y.toFixed(2)))
  }
  return vals.join(',')
}

function rowsForSample({ patient, cohort, item, date, scale, seed }) {
  const rows = [
    ['Item', 'Param', 'Value'],
    [item, '[检查项目]', item],
    [item, '[医院_医院名字]', 'ERG Viewer Demo'],
    [item, '[病人_姓名]', patient],
    [item, '[病人_性别]', seed % 2 ? '女' : '男'],
    [item, '[病人_年龄]', '0岁'],
    [item, '[检查_检查日期]', date],
    [item, '[检查_病人分组]', cohort],
  ]
  const push = (idx, side, suffix, value) =>
    rows.push([item, `[${side}_${String(idx).padStart(2, '0')}_${suffix}]`, String(value ?? '')])

  const toDemoFlash = (cdValue, msValue) => {
    const cd = Number(cdValue)
    if (!Number.isFinite(cd)) return '白色光'
    const ms = Number(msValue)
    const prefix = cd >= 1000 ? 'f' : 'b'
    const cdLabel = cd < 1 ? cd.toFixed(2) : cd.toFixed(1)
    return Number.isFinite(ms)
      ? `${prefix}白色光:${cdLabel}cd.m-2,${ms.toFixed(0)}ms`
      : `${prefix}白色光:${cdLabel}cd.m-2`
  }

  if (item === 'FVEP') {
    const fvepConditions = [
      { flashCd: 200, flashMs: 5, sampleHz: 1.3 },
      { flashCd: 600, flashMs: 5, sampleHz: 1.3 },
      { flashCd: 1000, flashMs: 5, sampleHz: 1.3 },
    ]
    fvepConditions.forEach((conditionSpec, conditionIndex) => {
      const idx = conditionIndex + 1
      const pairSeed = seededRandom(seed * 13 + idx * 7)
      const baseScale = scale * (1 + jitter(pairSeed, 0.05))
      const flashCd = conditionSpec.flashCd
      const flashMs = conditionSpec.flashMs
      const sampleHz = conditionSpec.sampleHz
      const n1t0 = 20 + (seed % 3) + idx * 0.5 + jitter(pairSeed, 0.55)
      const p1t0 = 28 + (seed % 2) + idx * 0.7 + jitter(pairSeed, 0.65)
      const n2t0 = 42 + (seed % 4) + idx * 0.8 + jitter(pairSeed, 0.75)
      const p2t0 = 58 + (seed % 5) + idx * 0.9 + jitter(pairSeed, 0.9)

      ;['R', 'L'].forEach((side) => {
        const sideSeed = stableTwin(seed * 17 + idx * 11, side)
        const sideScale =
          side === 'R' ? baseScale * (1 + jitter(sideSeed, 0.01)) : baseScale * (1 - jitter(sideSeed, 0.01))
        const n1t = n1t0 + jitter(sideSeed, 0.12)
        const p1t = p1t0 + jitter(sideSeed, 0.15)
        const n2t = n2t0 + jitter(sideSeed, 0.18)
        const p2t = p2t0 + jitter(sideSeed, 0.2)
        const n1a = Number((-1.2 * sideScale + jitter(sideSeed, 0.25)).toFixed(1))
        const p1a = Number((7.0 * sideScale + idx * 0.4 + jitter(sideSeed, 0.9)).toFixed(1))
        const n2a = Number((-5.5 * sideScale - idx * 0.25 + jitter(sideSeed, 0.95)).toFixed(1))
        const p2a = Number((14.5 * sideScale + idx * 0.9 + jitter(sideSeed, 1.25)).toFixed(1))

        push(idx, side, '名字', `FVEP(${idx})_白光${flashCd.toFixed(1)}标闪-暗室`)
        push(idx, side, '放大器', '1-75 Hz')
        push(idx, side, '闪光', toDemoFlash(flashCd, flashMs))
        push(idx, side, '闪光背景', 'b背景光_关:0.0cd.m-2')
        push(idx, side, '采样', `刺激频率:${sampleHz.toFixed(1)}Hz`)
        push(idx, side, '分析时间', '250ms')
        push(idx, side, '数据长度', '300')
        push(
          idx,
          side,
          '详细数据(uv)',
          demoWaveform('FVEP', sideScale, seed + idx + (side === 'R' ? 0.11 : -0.11), 300)
        )
        push(
          idx,
          side,
          '标记',
          `N1: ${n1t.toFixed(1)}ms ${n1a}uv P1: ${p1t.toFixed(1)}ms ${p1a}uv N2: ${n2t.toFixed(1)}ms ${n2a}uv P2: ${p2t.toFixed(1)}ms ${p2a}uv`
        )
      })
    })
    return rows
  }

  const modes = [
    ...[0.01, 0.03, 0.1, 0.3, 1, 3].map((flashCd) => ({
      name: 'dRod',
      displayName: 'dRod',
      flashCd,
      flashMs: flashCd === 3 ? 4 : 5,
      bg: 'b背景光_关:0.0cd.m-2',
      sample: flashCd === 3 ? '刺激间隔:2.0S' : '刺激间隔:10.0S',
      time: '200ms',
      ampA: 45 + Math.log10(flashCd + 1) * 30,
      ampB: 170 + Math.log10(flashCd * 100 + 1) * 92,
    })),
    ...[3, 20, 200, 600, 1000, 2000].flatMap((flashCd) => [
      {
        name: 'dMax',
        displayName: 'dMax',
        flashCd,
        flashMs: 5,
        bg: 'b背景光_关:0.0cd.m-2',
        sample: '刺激间隔:15.0S',
        time: '200ms',
        ampA: 115 + Math.log10(flashCd + 1) * 34,
        ampB: 470 + Math.log10(flashCd + 1) * 175,
      },
      {
        name: 'dOps',
        displayName: 'dOps',
        flashCd,
        flashMs: 5,
        bg: 'b背景光_关:0.0cd.m-2',
        sample: '刺激间隔:15.0S',
        time: '200ms',
        ampA: 95 + Math.log10(flashCd + 1) * 35,
      },
    ]),
    ...[600, 1000, 2000].flatMap((flashCd) => [
      {
        name: 'lCone',
        displayName: 'lCone',
        flashCd,
        flashMs: 5,
        bg: 'b白色光:30.0cd.m-2',
        sample: '刺激间隔:1.0S',
        time: '200ms',
        ampA: 24 + Math.log10(flashCd + 1) * 9,
        ampB: 95 + Math.log10(flashCd + 1) * 28,
      },
      {
        name: 'Flicker',
        displayName: 'lFlicker',
        flashCd,
        flashMs: 5,
        bg: 'b白色光:30.0cd.m-2',
        sample: '刺激频率:20.0Hz',
        time: '200ms',
      },
    ]),
  ]

  modes.forEach((mode, i) => {
    const idx = i + 1
    const pairSeed = seededRandom(seed * 19 + idx * 13 + (mode.name === 'Flicker' ? 7 : 17))
    const flashCd = mode.flashCd
    const flashMs = mode.flashMs
    const baseScale = scale * (1 + jitter(pairSeed, 0.06))
    const baseAT = 15 + i * 1.8 + jitter(pairSeed, 0.8)
    const baseBT = 34 + i * 3.6 + jitter(pairSeed, 1.0)
    const aARef = -Math.abs(mode.ampA * baseScale + jitter(pairSeed, 10))
    const bARef = mode.ampB ? mode.ampB * baseScale + jitter(pairSeed, 28) : 0

    ;['R', 'L'].forEach((side) => {
      const sideSeed = stableTwin(seed * 29 + idx * 17, side)
      const sideScale =
        side === 'R' ? baseScale * (1 + jitter(sideSeed, 0.018)) : baseScale * (1 - jitter(sideSeed, 0.018))
      const aT = baseAT + jitter(sideSeed, 0.1)
      const bT = baseBT + jitter(sideSeed, 0.14)
      const ampJ = jitter(sideSeed, mode.name === 'Flicker' ? 1.5 : 4.5)
      const aA = mode.ampA ? Number((aARef + jitter(sideSeed, 4)).toFixed(1)) : undefined
      const bA = mode.ampB ? Number((bARef + jitter(sideSeed, 50)).toFixed(1)) : undefined

      push(idx, side, '名字', `FERG(${idx})_${mode.displayName || mode.name}`)
      push(idx, side, '放大器', mode.name === 'Flicker' ? '1-300 Hz' : '1-75 Hz')
      push(idx, side, '闪光', toDemoFlash(flashCd, flashMs))
      push(idx, side, '闪光背景', mode.bg)
      push(idx, side, '采样', mode.sample)
      push(idx, side, '分析时间', mode.time)
      push(idx, side, '数据长度', mode.name === 'Flicker' ? '500' : '500')
      push(
        idx,
        side,
        '详细数据(uv)',
        demoWaveform(mode.name, sideScale, seed + idx + (side === 'R' ? 0.19 : -0.17), 500)
      )

      if (mode.name === 'dOps') {
        push(idx, side, '标记', `${Number((95 * sideScale + seed * 2 + ampJ).toFixed(1))}uv`)
      } else if (mode.name === 'Flicker') {
        const phase = 32 + seed * 1.5 + jitter(sideSeed, 1.2)
        push(
          idx,
          side,
          '标记',
          `幅值: ${Number((58 * sideScale + ampJ).toFixed(1))}uv 相位: ${Number((phase < 180 ? phase : phase % 180).toFixed(1))}°`
        )
      } else {
        push(
          idx,
          side,
          '标记',
          `a: ${aT.toFixed(1)}ms ${aA.toFixed(1)}uv b: ${bT.toFixed(1)}ms ${bA.toFixed(1)}uv`
        )
      }
    })
  })

  return rows
}

function main() {
  const outDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs', 'examples'))
  fs.mkdirSync(outDir, { recursive: true })
  const specs = []
  const controlScales = [0.88, 0.95, 1.01, 1.06, 1.12, 1.18, 1.24, 1.3]
  const ckoScales = [0.42, 0.48, 0.53, 0.58, 0.63, 0.68, 0.72, 0.76]
  const controlFvepScales = [0.86, 0.92, 0.98, 1.04, 1.1, 1.16, 1.22, 1.28]
  const ckoFvepScales = [0.4, 0.46, 0.51, 0.56, 0.61, 0.66, 0.7, 0.74]
  ;['control', 'cko'].forEach((cohort, ci) => {
    for (let i = 1; i <= 8; i += 1) {
      specs.push({
        patient: `demo-${cohort}-${i}`,
        cohort,
        item: 'FERG',
        date: `2026/06/${10 + i}`,
        scale: cohort === 'control' ? controlScales[i - 1] : ckoScales[i - 1],
        seed: ci * 10 + i,
        ext: 'xlsx',
      })
      specs.push({
        patient: `demo-${cohort}-${i}`,
        cohort,
        item: 'FVEP',
        date: `2026/06/${10 + i}`,
        scale: cohort === 'control' ? controlFvepScales[i - 1] : ckoFvepScales[i - 1],
        seed: ci * 10 + i + 30,
        ext: 'xlsx',
      })
    }
  })

  const written = []
  specs.forEach((spec) => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(rowsForSample(spec))
    XLSX.utils.book_append_sheet(wb, ws, 'sheet1')
    const file = path.join(outDir, `${spec.patient}_${spec.item}.${spec.ext}`)
    XLSX.writeFile(wb, file)
    written.push(file)
  })
  console.log(`Wrote ${written.length} demo files to ${outDir}`)
  written.forEach((file) => console.log(path.relative(process.cwd(), file)))
}

main()
