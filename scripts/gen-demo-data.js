const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

function demoWaveform(kind, scale, seed, n) {
  const vals = []
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1)
    const noise = Math.sin((i + 1) * (seed + 3) * 0.37) * 3
    let y = noise
    if (kind === 'dRod') {
      y += scale * (-80 * Math.exp(-Math.pow((t - 0.22) / 0.055, 2)) + 380 * Math.exp(-Math.pow((t - 0.36) / 0.09, 2)) - 65 * Math.exp(-Math.pow((t - 0.82) / 0.16, 2)))
    } else if (kind === 'dMax') {
      y += scale * (-160 * Math.exp(-Math.pow((t - 0.18) / 0.05, 2)) + 760 * Math.exp(-Math.pow((t - 0.30) / 0.08, 2)) + 160 * Math.exp(-Math.pow((t - 0.42) / 0.08, 2)) - 90 * Math.exp(-Math.pow((t - 0.78) / 0.18, 2)))
    } else if (kind === 'lCone') {
      y += scale * (-60 * Math.exp(-Math.pow((t - 0.20) / 0.045, 2)) + 260 * Math.exp(-Math.pow((t - 0.34) / 0.08, 2)) - 45 * Math.exp(-Math.pow((t - 0.75) / 0.16, 2)))
    } else if (kind === 'dOps') {
      y += scale * (70 * Math.sin(t * Math.PI * 38) * Math.exp(-Math.pow((t - 0.26) / 0.12, 2)) - 10)
    } else if (kind === 'Flicker') {
      y += scale * (60 * Math.sin(t * Math.PI * 8 + seed * 0.2) + 18 * Math.sin(t * Math.PI * 16))
    } else {
      y += scale * (-2 * Math.exp(-Math.pow((t - 0.18) / 0.055, 2)) + 7 * Math.exp(-Math.pow((t - 0.30) / 0.08, 2)) - 5 * Math.exp(-Math.pow((t - 0.46) / 0.09, 2)))
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
    [item, '[检查_病人分组]', cohort]
  ]
  const push = (idx, side, suffix, value) => rows.push([item, `[${side}_${String(idx).padStart(2, '0')}_${suffix}]`, String(value ?? '')])
  if (item === 'FVEP') {
    ;[1, 2].forEach((idx) => {
      ;['R', 'L'].forEach((side, si) => {
        const sideScale = scale * (side === 'R' ? 1 : 0.96)
        const n1t = 20 + (seed % 3) + idx
        const p1t = 28 + (seed % 2) + idx
        const n2t = 42 + (seed % 4) + idx
        const n1a = Number((-1.2 * sideScale - si * 0.2).toFixed(1))
        const p1a = Number((7.0 * sideScale + idx * 0.4).toFixed(1))
        const n2a = Number((-5.5 * sideScale - idx * 0.3).toFixed(1))
        push(idx, side, '名字', `FVEP(${idx})_白光3.0标闪-暗室`)
        push(idx, side, '分析时间', '120 ms')
        push(idx, side, '数据长度', '300')
        push(idx, side, '详细数据(uv)', demoWaveform('FVEP', sideScale, seed + idx + si, 300))
        push(idx, side, '标记', `N1: ${n1t.toFixed(1)}ms ${n1a}uv P1: ${p1t.toFixed(1)}ms ${p1a}uv N2: ${n2t.toFixed(1)}ms ${n2a}uv`)
      })
    })
    return rows
  }
  const modes = [
    { name: 'dRod', flash: '白色光: 0.01 cd·s/m²', time: '200 ms' },
    { name: 'dMax', flash: '白色光: 5.00 cd·s/m²', time: '200 ms' },
    { name: 'dOps', flash: '白色光: 5.00 cd·s/m²', time: '200 ms' },
    { name: 'lCone', flash: '白色光: 3.00 cd·s/m²', time: '200 ms' },
    { name: 'Flicker', flash: '白色光: 3.00 cd·s/m²', time: '500 ms' }
  ]
  modes.forEach((mode, i) => {
    const idx = i + 1
    ;['R', 'L'].forEach((side, si) => {
      const sideScale = scale * (side === 'R' ? 1 : 0.94)
      push(idx, side, '名字', `FERG(${idx})_${mode.name}`)
      push(idx, side, '放大器', mode.name === 'Flicker' ? '1-300 Hz' : '1-75 Hz')
      push(idx, side, '闪光', mode.flash)
      push(idx, side, '闪光背景', mode.name === 'dRod' || mode.name === 'dMax' || mode.name === 'dOps' ? '无背景光' : '白色背景光')
      push(idx, side, '采样', mode.name === 'Flicker' ? '刺激间隔: 50.0S' : '刺激间隔: 15.0S')
      push(idx, side, '分析时间', mode.time)
      push(idx, side, '数据长度', '500')
      push(idx, side, '详细数据(uv)', demoWaveform(mode.name, sideScale, seed + idx + si, 500))
      if (mode.name === 'dOps') {
        push(idx, side, '标记', `${Number((95 * sideScale + seed * 2).toFixed(1))}uv`)
      } else if (mode.name === 'Flicker') {
        push(idx, side, '标记', `幅值: ${Number((58 * sideScale).toFixed(1))}uv 相位: ${Number((32 + seed * 1.5).toFixed(1))}°`)
      } else {
        const aT = 15 + i * 2 + seed * 0.2
        const bT = 34 + i * 4 + seed * 0.2
        const aA = -Math.abs((mode.name === 'dMax' ? 170 : mode.name === 'lCone' ? 60 : 85) * sideScale)
        const bA = (mode.name === 'dMax' ? 760 : mode.name === 'lCone' ? 260 : 390) * sideScale
        push(idx, side, '标记', `a: ${aT.toFixed(1)}ms ${aA.toFixed(1)}uv b: ${bT.toFixed(1)}ms ${bA.toFixed(1)}uv`)
      }
    })
  })
  return rows
}

function main() {
  const outDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs', 'examples'))
  fs.mkdirSync(outDir, { recursive: true })
  const specs = []
  ;['control', 'cko'].forEach((cohort, ci) => {
    for (let i = 1; i <= 3; i += 1) {
      const scale = cohort === 'control' ? (1 + i * 0.035) : (0.58 + i * 0.035)
      specs.push({ patient: `demo-${cohort}-${i}`, cohort, item: 'FERG', date: `2026/06/${10 + i}`, scale, seed: ci * 10 + i, ext: 'xlsx' })
      specs.push({ patient: `demo-${cohort}-${i}`, cohort, item: 'FVEP', date: `2026/06/${10 + i}`, scale: cohort === 'control' ? (1 + i * 0.03) : (0.52 + i * 0.03), seed: ci * 10 + i + 30, ext: 'xls' })
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
