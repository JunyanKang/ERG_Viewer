const libs = window.libs || {}
const R = libs.React || window.React
const RD = libs.ReactDOM || window.ReactDOM
const XLS = libs.XLSX || window.XLSX
const PL = libs.Plotly || window.Plotly
if(!R || !RD || !XLS || !PL){
  const el = document.createElement('pre')
  el.style.padding = '16px'
  el.textContent = '模块加载失败: 未能加载 React/ReactDOM/XLSX/Plotly，请确认 index.html 已按顺序引入脚本。'
  document.body.appendChild(el)
  throw new Error('Global modules missing')
}

const { useState, useEffect, useRef } = R

// UI helpers: swap Left/Right labels as requested
function cnEye(side){ return side==='R' ? '左眼' : '右眼' } // swap display labels
function displaySideLetter(side){ return side==='R' ? 'L' : 'R' } // swap L/R in labels/titles

// Normalize number–unit spacing like 200ms -> 200 ms, 10μv -> 10 μv, 20Hz -> 20 Hz
function normalizeNumberUnitSpacing(s){
  if(s==null) return s
  let t = String(s)
  t = t.replace(/(\d)(ms)\b/gi, '$1 $2')
  t = t.replace(/(\d)(μ?v)\b/gi, '$1 $2')
  t = t.replace(/(\d)(hz)\b/gi, '$1 $2')
  t = t.replace(/(\d)(s)\b/gi, '$1 $2')
  t = t.replace(/(\d)(°)\b/g, '$1 $2')
  // cd only when followed by unit; ensure space before cd
  t = t.replace(/(\d)(\s*)(cd)(\s*[·\/.]\s*s\s*\/\s*m(?:\^?2|²)|\s*\/\s*m(?:\^?2|²))/gi, '$1 $3$4')
  // collapse multiple spaces to one
  t = t.replace(/\s{2,}/g,' ')
  return t
}

// Special formatting for '采样' row, e.g. "刺激间隔:1.0S" -> "刺激间隔：1.0 s"
function formatSamplingField(v){
  if(v==null) return v
  let t = String(v)
  // replace ascii ':' with Chinese full-width '：'
  t = t.replace(/:/g, '：')
  // standardize seconds unit: number + optional space + [Ss] -> number + space + 's'
  t = t.replace(/(\d(?:\.\d+)?)(\s*)[Ss]\b/g, (_m, num)=> `${num} s`)
  return t
}

function usePlot(){
  const ref = useRef(null)
  const [layout, setLayout] = useState(null)
  const [data, setData] = useState([])
  const [config] = useState({displayModeBar:false,responsive:true})
  const PlotlyRef = useRef(PL)

  useEffect(()=>{
    if(ref.current && PlotlyRef.current){
      PlotlyRef.current.newPlot(ref.current, data, layout||{}, config)
      const handleResize = () => PlotlyRef.current.Plots.resize(ref.current)
      window.addEventListener('resize', handleResize)
      return ()=>window.removeEventListener('resize', handleResize)
    }
  }, [ref.current])

  useEffect(()=>{ if(ref.current && PlotlyRef.current) PlotlyRef.current.react(ref.current, data, layout||{}, config) },[data, layout])

  return { ref, setLayout, setData, getDiv: ()=>ref.current, getPlotly: ()=>PlotlyRef.current }
}

function niceY(maxAbs){
  const candidates = [100,50,10]
  for(const base of candidates){
    const y = Math.ceil(maxAbs/base)*base
    if(y>0) return y
  }
  return Math.ceil(maxAbs/10)*10
}

function buildX(totalMs, n){
  const step = Number(totalMs)/Number(n)
  const arr = new Array(Number(n)).fill(0).map((_,i)=> Number((i*step).toFixed(3)))
  return arr
}

function parseY(str){
  if(!str) return []
  // split by comma/space/semicolon
  const parts = String(str).replace(/\r?\n/g,' ').split(/[,;\s]+/).filter(Boolean)
  return parts.map(v=>Number(v)).filter(v=>!Number.isNaN(v))
}

function sanitizeText(v){
  if(!v) return ''
  return String(v).replace(/\r?\n/g,' ').replace(/u/g,'μ').trim()
}

function sanitizeMark(v){
  const s = sanitizeText(v)
  if(!s) return ''
  return s.endsWith('v')? s : s + 'v'
}

function escapeHtml(v){
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function emptyOpsMarkList(){ return Array.from({length:5}, ()=>({})) }
function emptyOpsMarks(){ return { R: emptyOpsMarkList(), L: emptyOpsMarkList() } }
function emptyOpsDataFrame(){
  return {
    R: { peak: new Array(5).fill('NA'), trough: new Array(5).fill('NA') },
    L: { peak: new Array(5).fill('NA'), trough: new Array(5).fill('NA') }
  }
}

  function splitAB(name, mark){
    const target = ['dRod','dMax','lCone']
    const has = target.some(t=> (name||'').includes(t))
    if(!has) return null
    const s = sanitizeMark(mark)
    const idx = s.toLowerCase().indexOf('b:')
    if(idx<0) return null
    const a = s.slice(0, idx).replace(/^\s*a:\s*/i,'').trim()
    const b = s.slice(idx+2).trim()
    return {a,b}
  }

  // Parse lFlicker 标记中的 幅值/相位 数字
  function parseFlickerAmpPhase(mark){
    if(!mark) return { amp: null, phase: null }
    const s = sanitizeText(mark)
    // 优先按关键词匹配
    const ampMatch = /幅值\s*[：:\-]?\s*([+-]?\d+(?:\.\d+)?)/i.exec(s)
    const phaseMatch = /相位\s*[：:\-]?\s*([+-]?\d+(?:\.\d+)?)/i.exec(s)
    let amp = ampMatch ? Number(ampMatch[1]) : null
    let phase = phaseMatch ? Number(phaseMatch[1]) : null
    // 兜底：若未匹配到关键词，则按数字顺序推测：第一个为幅值，第二个为相位
    if((amp==null || Number.isNaN(amp)) || (phase==null || Number.isNaN(phase))){
      const nums = numbers2(s)
      if(amp==null && nums.length>=1) amp = Number(nums[0])
      if(phase==null && nums.length>=2) phase = Number(nums[1])
    }
    if(Number.isNaN(amp)) amp = null
    if(Number.isNaN(phase)) phase = null
    return { amp, phase }
  }

  // Parse FVEP mark string like: "N1: 21.0ms 0.5μv P1: 27.0ms 4.4μv ..."
  function parseFVEPMark(mark){
    const out = {}
    if(!mark) return out
    const s = sanitizeText(mark)
    const re = /(N|P)\s*(\d)\s*[:：]?\s*([+-]?\d+(?:\.\d+)?)\s*ms\s*([+-]?\d+(?:\.\d+)?)\s*[μu]?[vV]/g
    let m
    while((m = re.exec(s))){
      const label = (m[1].toUpperCase()+m[2])
      const t = Number(m[3])
      const a = Number(m[4])
      out[label] = { t: Number.isFinite(t)?t:null, a: Number.isFinite(a)?a:null }
    }
    return out
  }

// Try to extract flicker frequency (Hz) from strings like "20Hz"
function parseHzFromText(txt){
  if(!txt) return null
  const m = /(\d+(?:\.\d+)?)\s*Hz/i.exec(String(txt))
  if(m){
    const v = Number(m[1])
    return Number.isFinite(v) ? v : null
  }
  return null
}

// Guess flicker frequency for a side using available metadata; default to 20 Hz
function guessFlickerHz(meta){
  if(!meta) return 20
  const candidates = [meta['名字'], meta['闪光'], meta['采样']]
  for(const s of candidates){
    const hz = parseHzFromText(s)
    if(Number.isFinite(hz) && hz>0) return hz
  }
  return 20
}

// Compute amplitude (peak-peak) and phase (degrees) of a target-frequency component
// Steps: remove DC; compute a1,b1 via 2/N * sum x[n]*cos/sin(2πft[n]);
// A = sqrt(a1^2+b1^2); phase (sin-reference) φ = atan2(b1, a1) in degrees
function computeFlickerAmpPhaseFromWave(y, totalMs, fHz){
  const N = Array.isArray(y) ? y.length : 0
  if(!N || !Number.isFinite(totalMs) || totalMs<=0 || !Number.isFinite(fHz) || fHz<=0) return null
  // Remove DC
  const mean = y.reduce((s,v)=>s+(Number(v)||0),0)/N
  // Time step consistent with buildX: step = totalMs/N
  const dtSec = (totalMs/Math.max(N,1))/1000
  let sa = 0, sb = 0
  for(let n=0;n<N;n++){
    const xn = (Number(y[n])||0) - mean
    const t = n * dtSec
    const th = 2*Math.PI*fHz*t
    sa += xn * Math.cos(th)
    sb += xn * Math.sin(th)
  }
  const a1 = (2/N) * sa
  const b1 = (2/N) * sb
  const A = Math.hypot(a1, b1)
  const ampPP = 2 * A // peak-to-peak
  // Cosine-reference phase would be -atan2(b1,a1). As requested, flip sign to use sine reference.
  let phaseDeg = Math.atan2(b1, a1) * 180/Math.PI
  // Normalize to [-180,180] for readability
  if(phaseDeg>180) phaseDeg -= 360
  if(phaseDeg<=-180) phaseDeg += 360
  return { ampPP, phaseDeg }
}

function numbers2(str){
  if(!str) return []
  const out = []
  String(str).replace(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g, (m)=>{ out.push(Number(m)) })
  return out
}

// Format flash/flash background description to energy (cd·s/m²)
function formatFlashToEnergyText(key, raw){
  const s = sanitizeText(raw)
  if(!s) return ''
  // Special case: background light off
  if(key==='闪光背景' && /背景光_关/i.test(s)){
    return '无背景光'
  }

  // For 背景光: if there is only intensity (no ms), normalize label + unit format
  if(key==='闪光背景'){
    // try to get intensity right before 'cd'
    const cdOnly = /([0-9]+(?:\.[0-9]+)?)\s*cd(?:[\.\/]?\s*m-?2)?/i.exec(s)
    if(cdOnly){
      const intensity = Number(cdOnly[1])
      if(Number.isFinite(intensity)){
        let label = (s.split(/[:：]/)[0] || '').trim()
        label = label.replace(/^[A-Za-z_\-\s]+/, '').trim()
        if(label && !/光$/.test(label)) label = label + '光'
        return `${label}: ${intensity.toFixed(2)} cd/m²`
      }
    }
    // fallback: try to simply normalize unit and strip leading ascii before label
    let label = (s.split(/[:：]/)[0] || '').trim().replace(/^[A-Za-z_\-\s]+/, '').trim()
    if(label && !/光$/.test(label)) label = label + '光'
    const rest = s.split(/[:：]/)[1] || ''
    const normalized = rest.replace(/cd\s*[\.\/]?\s*m-?2/i, 'cd/m²')
    return label ? `${label}:${normalized.trim()}` : normalized.trim()
  }

  // Prefer structured extraction to avoid picking the "-2" from m-2 as a number
  // Pattern 1: label : <intensity> cd.m-2 , <ms> ms
  const main = /[:：]\s*([0-9]+(?:\.[0-9]+)?)\s*cd(?:[\.\/]?\s*m-?2)?\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*ms/i.exec(s)
  // Fallbacks: find first number before 'cd' and first number before 'ms'
  const cdMatch = /([0-9]+(?:\.[0-9]+)?)\s*cd/i.exec(s)
  const msMatch = /([0-9]+(?:\.[0-9]+)?)\s*ms/i.exec(s)

  let intensity = null
  let ms = null
  if(main){
    intensity = Number(main[1])
    ms = Number(main[2])
  }else if(cdMatch && msMatch){
    intensity = Number(cdMatch[1])
    ms = Number(msMatch[1])
  }

  if(Number.isFinite(intensity) && Number.isFinite(ms)){
    const energy = intensity * (ms/1000)
    // Extract label before ':' or '：'
    let label = (s.split(/[:：]/)[0] || '').trim()
    // remove leading ascii letters and separators (e.g., leading 'b')
    label = label.replace(/^[A-Za-z_\-\s]+/, '').trim()
    // Ensure label ends with "光" if it's a color descriptor like "白色"
    if(label && !/光$/.test(label)) label = label + '光'
    if(label){
      return `${label}: ${energy.toFixed(2)} cd·s/m²`
    }
    return `${energy.toFixed(2)} cd·s/m²`
  }
  // No parse -> return original text
  return s
}

// Helpers to build friendly names like: FERG_Flicker_R_0.01
function extractBaseFromName(nameStr){
  if(!nameStr) return ''
  const s = String(nameStr)
  const head = s.split(/[_\s]+/)[0] || s
  // remove parentheses content e.g. (15)
  const base = head.replace(/\([^)]*\)/g,'').replace(/[_\s]+$/,'').trim()
  // keep letters/numbers/CJK, drop trailing punctuation
  return base.replace(/[\s_]+/g,'')
}

function extractModeFromName(nameStr){
  if(!nameStr) return ''
  const s = String(nameStr)
  const parts = s.split(/[_\s]+/)
  let token = parts.length>1 ? parts[parts.length-1] : ''
  if(!token){
    // try to find common tokens
    const m = /(lFlicker|dRod|dMax|lCone|FVEP|dOps)/i.exec(s)
    token = m ? m[1] : ''
  }
  if(!token) return ''
  // remove leading l/d only for these patterns
  if(/^[ld][A-Za-z]+$/.test(token)) token = token.slice(1)
  // Normalize capitalization: first upper, rest as-is
  return token.charAt(0).toUpperCase() + token.slice(1)
}

function extractFlashValueForName(flashStr){
  if(!flashStr) return ''
  const s = sanitizeText(flashStr)
  // Try energy from intensity+ms
  const main = /([0-9]+(?:\.[0-9]+)?)\s*cd(?:[\.\/]?\s*m-?2)?[^\d]*([0-9]+(?:\.[0-9]+)?)\s*ms/i.exec(s)
  if(main){
    const intensity = Number(main[1])
    const ms = Number(main[2])
    if(Number.isFinite(intensity) && Number.isFinite(ms)){
      const energy = intensity * (ms/1000)
      return energy.toFixed(2)
    }
  }
  // If direct energy value present like "0.01 cd·s/m²" — grab number before cd
  const direct = /([0-9]+(?:\.[0-9]+)?)\s*cd(?:[\.·\/]?\s*s\s*\/\s*m\u00B2|\s*·\s*s\s*\/\s*m2|\s*·\s*s\s*\/\s*m\^?2|\s*\/m\^?2)?/i.exec(s)
  if(direct){
    const v = Number(direct[1])
    if(Number.isFinite(v)) return v.toFixed(2)
  }
  // Fallback: first number
  const nums = numbers2(s)
  if(nums.length) return Number(nums[0]).toFixed(2)
  return ''
}

function isGroupFVEP(group){
  const nr = group?.R?.['名字']||''
  const nl = group?.L?.['名字']||''
  return /FVEP/i.test(nr) || /FVEP/i.test(nl)
}

function buildFriendlyName(side, group){
  const nameStr = group?.[side]?.['名字'] || ''
  const flashStr = group?.[side]?.['闪光'] || ''
  const flashVal = extractFlashValueForName(flashStr)
  if(isGroupFVEP(group)){
    const idx = group?.idx != null ? group.idx : ''
    const parts = ['FVEP', idx, flashVal].filter(v=>v!=='' && v!=null)
    return parts.join('_')
  }
  const base = extractBaseFromName(nameStr)
  const mode = extractModeFromName(nameStr)
  const dispSide = displaySideLetter(side)
  return [base, mode, dispSide, flashVal].filter(Boolean).join('_')
}

function formatMarkToXY(s){
  const nums = numbers2(s)
  if(nums.length>=2){
    return `${nums[0].toFixed(2)} ms, ${nums[1].toFixed(2)} μv`
  }
  if(nums.length===1){
    return `${nums[0].toFixed(2)} μv`
  }
  return sanitizeText(s)
}

function InfoKV({rows}){
  // rows: list of {k,v}
  return R.createElement('div',{className:'kv'}, rows.flatMap(({k,v})=>[
    R.createElement('div',{key:k+':k',className:'muted'},k),
    R.createElement('div',{key:k+':v'}, normalizeNumberUnitSpacing(v)||'-')
  ]))
}

function PlotPanel({title, side, group, onExportImage, onExportData, enableAnnotate, onAnnotateClick, activeAnnotate, onPointPicked, onRangePersist, onHoverPoint, onHoverEnd, overlayText, marking, disabled, suppressSpikes}){
  const plot = usePlot()
  const [ymax,setYmax] = useState(null)
  const [ymin,setYmin] = useState(null)
  const [hoverXY,setHoverXY] = useState(null)
  const [step,setStep] = useState(20)
  const fineRef = useRef(false)
  const lastHoverXRef = useRef(null)
  const lastHoverIdxRef = useRef(null)
  const lastHoverXYRef = useRef(null)
  const [toastMsg, setToastMsg] = useState(null)
  const copyTimerRef = useRef(null)

  function showToast(msg){
    try{ if(copyTimerRef.current){ clearTimeout(copyTimerRef.current); copyTimerRef.current = null } }catch(_e){}
    setToastMsg(msg || '')
    copyTimerRef.current = setTimeout(()=>{ setToastMsg(null); copyTimerRef.current = null }, 500)
  }

  const suffix = {
    name: '名字', amp: '放大器', flash: '闪光', flashBg: '闪光背景', sample: '采样', time: '分析时间', len: '数据长度', data: '详细数据(uv)', mark: '标记'
  }
  const sideData = group?.[side]||{}
  const name = sideData[suffix.name]||''
  const timeMs = Number((sideData[suffix.time]||'').toString().replace(/[^\d.]/g,'')) || 0
  const n = Number((sideData[suffix.len]||'').toString().replace(/[^\d.]/g,'')) || 0
  const y = parseY(sideData[suffix.data])
  const x = (timeMs>0 && n>0)? buildX(timeMs, y.length||n) : []

  // Ensure Y range adjustments are per-mode only: initialize from persisted (mode-scoped) if provided
  useEffect(()=>{
    if(group && group.__persist && group.__persist[side]){
      const pr = group.__persist[side]
      setYmin(pr.ymin ?? null)
      setYmax(pr.ymax ?? null)
    } else {
      setYmin(null); setYmax(null)
    }
  }, [group?.idx, side, group?.__modeKey])

  useEffect(()=>{
    if(!x.length || !y.length){
      plot.setData([])
      plot.setLayout({ paper_bgcolor:'#ffffff', plot_bgcolor:'#ffffff', font:{color:'#000000'} })
      return
    }
    const maxAbs = Math.max(...y.map(v=>Math.abs(v)))
    const initY = niceY(maxAbs*1.2 || 10)
    const ym = ymax ?? initY
    const yn = ymin ?? -initY
    const tickVals = [0,50,100,150,200].filter(t=>t<= (timeMs||200))
    // Restore persisted X range if available for this group+side
    const pr = (group && group.__persist && group.__persist[side]) ? group.__persist[side] : null
    const xr0 = pr && Number.isFinite(pr.xmin) ? pr.xmin : null
    const xr1 = pr && Number.isFinite(pr.xmax) ? pr.xmax : null
    // Default padded X range to avoid edge-hover axis stretching
    let padXRange = null
    if(x.length){
      const x0 = 0
      const x1 = (Number(timeMs)||0) > 0 ? Number(timeMs) : Number(x[x.length-1])
      const span = Math.max(1e-6, x1 - x0)
      const pad = span * 0.1
      padXRange = [x0 - pad, x1 + pad]
    }
    const spikesOn = Boolean((activeAnnotate || marking) && !suppressSpikes)
    const rootStyle = getComputedStyle(document.documentElement)
    const lineColor = side==='R' ? (rootStyle.getPropertyValue('--line-right').trim() || '#D97C5A') : (rootStyle.getPropertyValue('--line-left').trim() || '#5B8FB9')
    const axisColor = rootStyle.getPropertyValue('--axis').trim() || '#6B5F57'
    const gridColor = rootStyle.getPropertyValue('--grid').trim() || '#E8E1D9'
    const spikeColor = rootStyle.getPropertyValue('--spike').trim() || axisColor
    const fgColor = rootStyle.getPropertyValue('--fg').trim() || '#2F2A26'
    const hoverBg = rootStyle.getPropertyValue('--hoverlabel-bg').trim() || '#FFF7EC'
    const hoverFg = rootStyle.getPropertyValue('--hoverlabel-fg').trim() || fgColor
    plot.setData([
      { x, y, type:'scatter', mode:'lines', line:{color: lineColor, width:2}, name:'', showlegend:false, hovertemplate:'(%{x:.2f}, %{y:.2f})<extra></extra>' },
      { x:[null], y:[null], type:'scatter', mode:'markers', marker:{size:8,color:'#f59e0b'}, hoverinfo:'skip', showlegend:false, cliponaxis: false }
    ])
    plot.setLayout({
      // Keep current group's X zoom/pan only within this group+side
      // Changing group will change uirevision and reset X to autorange
      uirevision: `${side}-${group?.idx ?? 'nogrp'}`,
      margin:{l:50,r:10,t:10,b:40},
      paper_bgcolor:'rgba(0,0,0,0)',
      plot_bgcolor:'rgba(0,0,0,0)',
      font:{ color: fgColor },
      hoverdistance: spikesOn? 1 : 20,
      spikedistance: spikesOn? -1 : 20,
      xaxis:{
        title:'Time (ms)',
        color: axisColor,
        gridcolor: gridColor,
        zeroline:false,
        tickvals: tickVals,
        // if we have persisted x-range, apply it; otherwise let autorange
        ...(xr0!=null && xr1!=null ? { range: [xr0, xr1] } : (padXRange? { range: padXRange } : {})),
        showspikes: spikesOn,
        spikemode: 'across',
        spikesnap: 'cursor',
        spikethickness: 2,
        spikecolor: spikeColor,
        showline:true,
        linecolor: axisColor,
        linewidth:1
      },
      yaxis:{
        title:'Amplitude (μv)',
        color: axisColor,
        gridcolor: gridColor,
        zeroline:false,
        range:[yn, ym],
        showspikes: spikesOn,
        spikemode: 'across',
        spikesnap: 'cursor',
        spikethickness: 2,
        spikecolor: spikeColor,
        nticks: 7
      },
      hovermode:'closest',
      showlegend:false
    })
  }, [group, ymax, ymin, activeAnnotate, marking])

  useEffect(()=>{ if(!suppressSpikes) lastHoverXRef.current = null }, [suppressSpikes, group?.idx])

  useEffect(()=>{
    // When annotate mode toggles while cursor is inside the plot, immediately sync spikes state
    const div = plot.getDiv()
    const P = plot.getPlotly()
    if(!div || !P) return
    try{
      if(activeAnnotate || marking) enableFine(); else disableFine()
    }catch(_e){}
  }, [activeAnnotate, marking, plot.getDiv()])

  useEffect(()=>{
    const div = plot.getDiv()
    if(!div) return
    const P = plot.getPlotly()

    function enableFine(){
      if(fineRef.current) return
      if(!P) return
      fineRef.current = true
      // much smaller hover distance + stronger spikes for precision picking
      try{
        const fl = (div && div._fullLayout) || {}
        const xr = (fl.xaxis && fl.xaxis.range) || null
        const yr = (fl.yaxis && fl.yaxis.range) || null
        const rootStyle = getComputedStyle(document.documentElement)
        const spikeColor = (rootStyle.getPropertyValue('--spike').trim() || '#6B5F57')
        const hoverBg = (rootStyle.getPropertyValue('--hoverlabel-bg').trim() || '#FFF7EC')
        const hoverFg = (rootStyle.getPropertyValue('--hoverlabel-fg').trim() || '#2F2A26')
        const rel = {
          hoverdistance: 12,
          spikedistance: -1,
          clickmode: 'event+select',
          'xaxis.showspikes': true,
          'yaxis.showspikes': true,
          'xaxis.spikemode': 'across',
          'yaxis.spikemode': 'across',
          'xaxis.spikesnap': 'cursor',
          'yaxis.spikesnap': 'cursor',
          'xaxis.spikethickness': 2,
          'yaxis.spikethickness': 2,
          'xaxis.spikecolor': spikeColor,
          'yaxis.spikecolor': spikeColor,
          'hoverlabel.bgcolor': hoverBg,
          'hoverlabel.font.color': hoverFg,
          'hoverlabel.font.size': 12
        }
        if(xr && xr.length===2 && isFinite(xr[0]) && isFinite(xr[1])) rel['xaxis.range'] = [xr[0], xr[1]]
        if(yr && yr.length===2 && isFinite(yr[0]) && isFinite(yr[1])) rel['yaxis.range'] = [yr[0], yr[1]]
        P.relayout(div, rel)
        // show small markers on the line to help snapping
        P.restyle(div, { mode: 'lines+markers', 'marker.size': 3 }, [0])
        // enlarge the hover highlight marker
        P.restyle(div, { 'marker.size': 12 }, [1])
      }catch(_e){}
      div.style.cursor = 'crosshair'
    }
    function disableFine(){
      if(!fineRef.current) return
      if(!P) return
      fineRef.current = false
      try{
        const fl = (div && div._fullLayout) || {}
        const xr = (fl.xaxis && fl.xaxis.range) || null
        const yr = (fl.yaxis && fl.yaxis.range) || null
        const rel = { hoverdistance: 20, spikedistance: 20, 'xaxis.showspikes': false, 'yaxis.showspikes': false }
        if(xr && xr.length===2 && isFinite(xr[0]) && isFinite(xr[1])) rel['xaxis.range'] = [xr[0], xr[1]]
        if(yr && yr.length===2 && isFinite(yr[0]) && isFinite(yr[1])) rel['yaxis.range'] = [yr[0], yr[1]]
        P.relayout(div, rel)
        P.restyle(div, { mode: 'lines' }, [0])
        P.restyle(div, { 'marker.size': 8 }, [1])
      }catch(_e){}
      div.style.cursor = ''
    }

    function onEnter(){ if((activeAnnotate || marking) && !suppressSpikes) enableFine(); else disableFine() }
    function onLeave(){ disableFine(); onHoverEnd && onHoverEnd() }
    function onMove(){
      // Ensure spikes state tracks annotate mode continuously while inside the plot
      if((activeAnnotate || marking) && !suppressSpikes) enableFine(); else disableFine()
    }

    div.addEventListener('mouseenter', onEnter)
    div.addEventListener('mouseleave', onLeave)
    div.addEventListener('mousemove', onMove)
    function onHover(e){
      const pt = e.points && e.points[0]
      if(pt){
        if(typeof pt.pointNumber==='number'){ try{ lastHoverXRef.current = Number(pt.x); lastHoverIdxRef.current = pt.pointNumber }catch(_e){} }
        lastHoverXYRef.current = { x: Number(pt.x), y: Number(pt.y) }
        // When magnifier is active (suppressSpikes true), require larger movement to trigger hover logic
        if(suppressSpikes){
          try{
            const fl = (div && div._fullLayout) || {}
            const xr = (fl.xaxis && fl.xaxis.range) || null
            const width = div && div.clientWidth ? div.clientWidth : 600
            if(xr && xr.length===2 && Number.isFinite(xr[0]) && Number.isFinite(xr[1])){
          const dataPerPixel = (xr[1]-xr[0]) / Math.max(1,width)
          const threshold = dataPerPixel * 30 // require ~30px worth of movement in data units
              const last = lastHoverXRef.current
              if(last!=null && Math.abs(Number(pt.x)-Number(last)) < threshold){
                return
              }
              lastHoverXRef.current = Number(pt.x)
            }
          }catch(_e){}
        }
        setHoverXY({x: pt.x, y: pt.y})
        // update highlight trace index 1
        const P = plot.getPlotly()
        if(P) P.restyle(div, {x:[[pt.x]], y:[[pt.y]]}, [1])
        if(activeAnnotate && typeof pt.pointNumber==='number'){
          const idx = pt.pointNumber
          const lo = Math.max(0, idx-5), hi = Math.min(y.length-1, idx+5)
          const sx = x.slice(lo, hi+1)
          const sy = y.slice(lo, hi+1)
          onHoverPoint && onHoverPoint({side, x: pt.x, y: pt.y, idx, sx, sy, center: idx-lo})
        }
      }
    }
    function onUnhover(){
      const P = plot.getPlotly()
      if(P){
        // clear highlight marker
        try{ P.restyle(div,{x:[[null]],y:[[null]]},[1]) }catch(_e){}
        // Only keep spikelines when annotate/marking is active; otherwise ensure they are off
        try{
          if(activeAnnotate || marking){
            P.relayout(div, {
              hoverdistance: 1,
              spikedistance: -1,
              'xaxis.showspikes': true,
              'yaxis.showspikes': true,
              'xaxis.spikesnap': 'cursor',
              'yaxis.spikesnap': 'cursor'
            })
          }else{
            P.relayout(div, {
              hoverdistance: 20,
              spikedistance: 20,
              'xaxis.showspikes': false,
              'yaxis.showspikes': false
            })
          }
        }catch(_e){}
      }
      setHoverXY(null)
      onHoverEnd && onHoverEnd()
    }
    function onRelayout(ev){
      // Persist user-updated axis ranges (x and y) so navigation keeps them
      if(!onRangePersist) return
      const r = {}
      if(ev){
        if(Object.prototype.hasOwnProperty.call(ev, 'xaxis.range[0]') && Object.prototype.hasOwnProperty.call(ev, 'xaxis.range[1]')){
          r.xmin = Number(ev['xaxis.range[0]'])
          r.xmax = Number(ev['xaxis.range[1]'])
        }
        if(Object.prototype.hasOwnProperty.call(ev, 'xaxis.autorange') && ev['xaxis.autorange']===true){ r.xmin = null; r.xmax = null }
        if(Object.prototype.hasOwnProperty.call(ev, 'yaxis.range[0]') && Object.prototype.hasOwnProperty.call(ev, 'yaxis.range[1]')){
          r.ymin = Number(ev['yaxis.range[0]'])
          r.ymax = Number(ev['yaxis.range[1]'])
        }
        if(Object.prototype.hasOwnProperty.call(ev, 'yaxis.autorange') && ev['yaxis.autorange']===true){ r.ymin = null; r.ymax = null }
      }
      // Only persist if something present
      if(Object.keys(r).length){ onRangePersist(r) }
    }
    const clickHandledAtRef = { current: 0 }
    function handlePick(cx, cy){
      const P = plot.getPlotly(); if(P) P.restyle(div, {x:[[cx]], y:[[cy]]}, [1])
      onPointPicked && onPointPicked({side, x: cx, y: cy, mode: activeAnnotate})
      onHoverEnd && onHoverEnd()
      disableFine()
      clickHandledAtRef.current = Date.now()
    }
    function onClick(e){
      if(!activeAnnotate) return
      let cx = null, cy = null
      if(lastHoverXYRef.current){
        cx = Number(lastHoverXYRef.current.x)
        cy = Number(lastHoverXYRef.current.y)
        handlePick(cx, cy)
        return
      }
      const pt = e.points && e.points[0]
      let idx = (typeof pt?.pointNumber==='number') ? pt.pointNumber : (typeof lastHoverXRef.current==='number' ? (function(){
        let best=0,bestd=Infinity; for(let i=0;i<x.length;i++){ const d=Math.abs(Number(x[i]) - Number(lastHoverXRef.current)); if(d<bestd){bestd=d; best=i} } return best })() : 0)
      idx = Math.max(0, Math.min(y.length-1, idx))
      cx = Number(x[idx])
      cy = Number(y[idx])
      handlePick(cx, cy)
    }
    function onDomClick(){
      if(!activeAnnotate) return
      // If plotly did not emit a point click, still pick the last hovered coords
      if(Date.now() - clickHandledAtRef.current < 50) return
      if(lastHoverXYRef.current){
        const cx = Number(lastHoverXYRef.current.x)
        const cy = Number(lastHoverXYRef.current.y)
        handlePick(cx, cy)
      }
    }
    div.on('plotly_hover', onHover)
    div.on('plotly_unhover', onUnhover)
    div.on('plotly_relayout', onRelayout)
    div.on('plotly_click', onClick)
    div.addEventListener('click', onDomClick)
    return ()=>{
      div.removeAllListeners('plotly_hover')
      div.removeAllListeners('plotly_unhover')
      div.removeAllListeners('plotly_relayout')
      div.removeAllListeners('plotly_click')
      div.removeEventListener('mouseenter', onEnter)
      div.removeEventListener('mouseleave', onLeave)
      div.removeEventListener('mousemove', onMove)
      div.removeEventListener('click', onDomClick)
      disableFine()
    }
  }, [plot.getDiv(), activeAnnotate, marking])

  function snapToStep(val, s){ if(!isFinite(val)||!isFinite(s)||s<=0) return val; return Math.round(val/s)*s }
  function changeYMax(sign){
    setYmax(v=>{
      if(v==null){
        // derive current top and snap before first move
        const maxAbs = y.length? Math.max(...y.map(v=>Math.abs(v))) : 0
        const initY = niceY(maxAbs*1.2 || 10)
        const curr = initY
        const snapped = snapToStep(curr, step)
        const next = snapped + sign*step
        onRangePersist && onRangePersist({ ymin, ymax: next })
        return next
      }
      const next = v + sign*step
      onRangePersist && onRangePersist({ ymin, ymax: next })
      return next
    })
  }
  function changeYMin(sign){
    setYmin(v=>{
      if(v==null){
        const maxAbs = y.length? Math.max(...y.map(v=>Math.abs(v))) : 0
        const initY = niceY(maxAbs*1.2 || 10)
        const curr = -initY
        const snapped = snapToStep(curr, step)
        const next = snapped + sign*step
        onRangePersist && onRangePersist({ ymin: next, ymax })
        return next
      }
      const next = v + sign*step
      onRangePersist && onRangePersist({ ymin: next, ymax })
      return next
    })
  }
  function resetY(){
    // deprecated: kept for safety; now handled by resetAxes
    resetAxes()
  }
  function resetAxes(){
    // Reset to initial symmetric nice Y and initial X [0, timeMs]
    const div = plot.getDiv()
    const P = plot.getPlotly()
    const maxAbs = y.length? Math.max(...y.map(v=>Math.abs(v))) : 0
    const initY = niceY(maxAbs*1.2 || 10)
    const x0 = 0
    const x1 = (Number(timeMs)||0) > 0 ? Number(timeMs) : (x.length? Number(x[x.length-1]) : 0)
    const span = Math.max(1e-6, x1 - x0)
    const pad = span * 0.1
    const xr = [x0 - pad, x1 + pad]
    if(div && P){
      try{ P.relayout(div, { 'xaxis.range': xr, 'yaxis.range': [-initY, initY] }) }catch(_e){}
    }
    // Clear local y state so effect computes from data next time; persist explicit ranges for stability
    setYmax(null); setYmin(null)
    onRangePersist && onRangePersist({ xmin: xr[0], xmax: xr[1], ymin: -initY, ymax: initY })
  }

  async function copyAllData(){
    if(!Array.isArray(x) || !Array.isArray(y) || y.length===0){ return }
    const lines = ['x (ms), y (μv)']
    const n = Math.min(x.length, y.length)
    for(let i=0;i<n;i++){
      const xv = x[i]
      const yv = y[i]
      lines.push(`${Number(xv).toString()}, ${Number(yv).toString()}`)
    }
    const txt = lines.join('\n')
    try{ await window.electronAPI.clipboardWriteText(txt) }catch(_e){}
  }
  function resetX(){
    const div = plot.getDiv()
    const P = plot.getPlotly()
    if(div && P){ try{ P.relayout(div, { 'xaxis.autorange': true }) }catch(_e){} }
    onRangePersist && onRangePersist({ xmin: null, xmax: null })
  }

  return R.createElement('div', {className:'card plot-card'}, [
      R.createElement('div',{key:'title',className:'titlebar'},
      R.createElement('div',null, buildFriendlyName(side, group) || (group?.[side]?.['名字'] || ''))
    ),
    R.createElement('div',{key:'plotw', className:'plot-wrap'},[
      R.createElement('div',{key:'plot', className:'plot', ref:plot.ref}),
      (overlayText || activeAnnotate) && R.createElement('div',{key:'annotov', className:'annot-overlay'}, overlayText || (()=>{
        if(activeAnnotate==='a') return '点击选择a波位置'
        if(activeAnnotate==='b') return '点击选择b波位置'
        if(activeAnnotate) return `点击选择${activeAnnotate}位置`
        return ''
      })()),
      toastMsg && R.createElement('div',{key:'copytoast', className:'plot-toast'}, toastMsg)
    ]),
    R.createElement('div',{key:'ctrl1', className:'controls', style:{justifyContent:'space-between'}},[
      R.createElement('div',{style:{display:'flex',gap:8,alignItems:'center'}},[
      R.createElement('span',{className:'chip'}, (()=>{
          if(!y.length) return 'ymin: —'
          const maxAbs = Math.max(...y.map(v=>Math.abs(v)))
          const initY = niceY(maxAbs*1.2 || 10)
          const yn = (ymin ?? -initY)
          return `ymin: ${yn}`
        })() ),
        R.createElement('button',{className:'btn', disabled, onClick:()=>!disabled&&changeYMin(-1)}, '−'),
        R.createElement('button',{className:'btn', disabled, onClick:()=>!disabled&&changeYMin(1)}, '+')
      ]),
      // center step selector
      R.createElement('div',{style:{flex:1,display:'flex',justifyContent:'center',alignItems:'center'}},
        R.createElement('select',{className:'select', disabled, value:step, onChange:e=>setStep(Number(e.target.value))},
          [10,20,30,50,150,200,500].map(v=> R.createElement('option',{key:v, value:v}, v))
        )
      ),
      R.createElement('div',{style:{display:'flex',gap:8,alignItems:'center'}},[
      R.createElement('span',{className:'chip'}, (()=>{
          if(!y.length) return 'ymax: —'
          const maxAbs = Math.max(...y.map(v=>Math.abs(v)))
          const initY = niceY(maxAbs*1.2 || 10)
          const ym = (ymax ?? initY)
          return `ymax: ${ym}`
        })() ),
        R.createElement('button',{className:'btn', disabled, onClick:()=>!disabled&&changeYMax(-1)}, '−'),
        R.createElement('button',{className:'btn', disabled, onClick:()=>!disabled&&changeYMax(1)}, '+')
      ])
    ]),
    R.createElement('div',{key:'ctrl2', className:'controls'},[
      // row 2: reset to initial x/y, and exports (smaller buttons)
      (function(){ const resetDisabled = Boolean(disabled && !(activeAnnotate || marking)); return R.createElement('button',{className:'btn btn-sm', disabled: resetDisabled, onClick:()=>{ if(resetDisabled) return; resetAxes() }}, '重置') })(),
      R.createElement('span',{style:{flex:1}}),
      R.createElement('span',{className:'export'},[
        R.createElement('button',{className:'btn btn-sm', disabled, onClick: async ()=>{ if(disabled) return; if(onExportImage){ const r = await onExportImage(side,'copy', plot.getDiv()); if(r && r.ok){ showToast('当前图像已复制到剪贴板') } } }}, '复制图像'),
        R.createElement('button',{className:'btn btn-sm', disabled, onClick:()=>{ if(disabled) return; copyAllData().then(()=>showToast('当前绘图数据已复制到剪贴板')) }}, '复制数据'),
        R.createElement('button',{className:'btn btn-sm', disabled, onClick:()=>!disabled&&onExportImage && onExportImage(side,'pdf', plot.getDiv())}, '导出PDF'),
        R.createElement('button',{className:'btn btn-sm', disabled, onClick:()=>!disabled&&onExportImage && onExportImage(side,'svg', plot.getDiv())}, '导出SVG'),
        R.createElement('button',{className:'btn btn-sm', disabled, onClick:()=>!disabled&&onExportData && onExportData(side)}, '导出数据')
      ])
    ]),
    null
  ])
}

  function App(){
  const [filePath, setFilePath] = useState(null)
  const [rawRows, setRawRows] = useState([])
  const [groups, setGroups] = useState([])
  const [current, setCurrent] = useState(0)
  const [basicInfo, setBasicInfo] = useState({})
  const [annotMode, setAnnotMode] = useState({R:null,L:null})
  const [annotations, setAnnotations] = useState({})
  const [fvepAnnotations, setFvepAnnotations] = useState({}) // { gid: { R:{N1:{x,y},P1:{},N2:{},P2:{}}, L:{...} } }
  const [yRanges, setYRanges] = useState({})
  const [magnify, setMagnify] = useState(null) // {side, sx, sy, center, idx, x, y}
  const magnifyTimerRef = useRef(null)
  const magnifyArmRef = useRef(null)
  const [suppressSpikes, setSuppressSpikes] = useState(false)
  const [opsMarks, setOpsMarks] = useState({}) // { gid: { R:[{peak, valley}], L:[...] } }
  const [opsMode, setOpsMode] = useState({R:{op:null, kind:null}, L:{op:null, kind:null}})
  // Ops active toggle removed; we arm per-cell directly
  const [opsActive, setOpsActive] = useState({R:false, L:false})
  const [opsManualSum, setOpsManualSum] = useState({}) // { gid: {R:value, L:value} }
  // Per-eye dataframes for Ops manual annotations: rows peak/trough, cols Op1-5, initial NA
  const [opsDataFrames, setOpsDataFrames] = useState({}) // { gid: { R:{peak:[NA..], trough:[NA..]}, L:{peak:[NA..], trough:[NA..]} } }
  const [themeOpen, setThemeOpen] = useState(false)
  const [themeIdx, setThemeIdx] = useState(0)

  const THEMES = [
    { name:'温润米白', swatch:'#FFF6EA', vars:{
      '--bg':'#FFFCF7','--fg':'#2F2A26','--muted':'#7A6F66','--header-bg':'rgba(255,253,248,.85)',
      '--card-bg':'#FFFDF9','--border':'#F2EBE1','--btn-bg':'#FFF7EE','--btn-bg-hover':'#FFEFE1','--btn-fg':'#2F2A26',
      '--primary':'#8BB9F1','--primary-hover':'#79A7E5','--primary-fg':'#163052','--chip-bg':'#FFF4E9',
      '--plot-bg':'rgba(0,0,0,0)','--overlay-bg':'rgba(255,248,237,.9)','--overlay-border':'#F2E4D1','--overlay-fg':'#8B5E2B',
      '--magnifier-bg':'#FFFDF9','--magnifier-border':'#F2EBE1','--magnifier-fg':'#2F2A26','--select-bg':'#FFF9F0',
      '--toast-bg':'rgba(255,248,237,.9)','--toast-fg':'#2F2A26','--toast-border':'#F2E4D1',
      '--axis':'#8A7E73','--grid':'#F0E8DF','--spike':'#8A7E73','--hoverlabel-bg':'#FFF9F0','--hoverlabel-fg':'#2F2A26',
      '--line-right':'#D97C5A','--line-left':'#5B8FB9'
    }},
    { name:'晨雾灰蓝', swatch:'#DDE7F3', vars:{
      '--bg':'#F6F8FA','--fg':'#1F2937','--muted':'#475569','--header-bg':'rgba(246,248,250,.85)',
      '--card-bg':'#FFFFFF','--border':'#E5E7EB','--btn-bg':'#EEF2F7','--btn-bg-hover':'#E6EBF3','--btn-fg':'#1F2937',
      '--primary':'#8AA7C7','--primary-hover':'#7B99BA','--primary-fg':'#0F172A','--chip-bg':'#EEF2F7',
      '--plot-bg':'rgba(0,0,0,0)','--overlay-bg':'rgba(243,246,249,.95)','--overlay-border':'#E5E7EB','--overlay-fg':'#334155',
      '--magnifier-bg':'#FFFFFF','--magnifier-border':'#E5E7EB','--magnifier-fg':'#1F2937','--select-bg':'#F3F6F9',
      '--toast-bg':'rgba(243,246,249,.95)','--toast-fg':'#1F2937','--toast-border':'#E5E7EB',
      '--axis':'#64748B','--grid':'#E5E7EB','--spike':'#64748B','--hoverlabel-bg':'#F3F6F9','--hoverlabel-fg':'#1F2937',
      '--line-right':'#4C6FA3','--line-left':'#7FB3D5'
    }},
    { name:'清新薄荷', swatch:'#AEE5CE', vars:{
      '--bg':'#F3FBF7','--fg':'#1F2D26','--muted':'#4F6F61','--header-bg':'rgba(243,251,247,.85)',
      '--card-bg':'#FFFFFF','--border':'#D7EFE4','--btn-bg':'#ECF8F2','--btn-bg-hover':'#E3F2EC','--btn-fg':'#1F2D26',
      '--primary':'#6BD4A8','--primary-hover':'#5CC79B','--primary-fg':'#0F3B2E','--chip-bg':'#EEF7F1',
      '--plot-bg':'rgba(0,0,0,0)','--overlay-bg':'rgba(238,247,241,.95)','--overlay-border':'#D7EFE4','--overlay-fg':'#2C5E4B',
      '--magnifier-bg':'#FFFFFF','--magnifier-border':'#D7EFE4','--magnifier-fg':'#1F2D26','--select-bg':'#F4FAF7',
      '--toast-bg':'rgba(238,247,241,.95)','--toast-fg':'#1F2D26','--toast-border':'#D7EFE4',
      '--axis':'#4F6F61','--grid':'#D7EFE4','--spike':'#4F6F61','--hoverlabel-bg':'#F4FAF7','--hoverlabel-fg':'#1F2D26',
      '--line-right':'#34A853','--line-left':'#1E88E5'
    }},
    { name:'柔和杏粉', swatch:'#F7CFCB', vars:{
      '--bg':'#FFF7F5','--fg':'#2E2320','--muted':'#6B5F57','--header-bg':'rgba(255,247,245,.85)',
      '--card-bg':'#FFFFFF','--border':'#F0DFDA','--btn-bg':'#F7EFEC','--btn-bg-hover':'#F0E6E2','--btn-fg':'#2E2320',
      '--primary':'#F4A7A0','--primary-hover':'#E8968E','--primary-fg':'#4A2622','--chip-bg':'#F7EEEA',
      '--plot-bg':'rgba(0,0,0,0)','--overlay-bg':'rgba(255,241,236,.95)','--overlay-border':'#F0DFDA','--overlay-fg':'#8B5E2B',
      '--magnifier-bg':'#FFFFFF','--magnifier-border':'#F0DFDA','--magnifier-fg':'#2E2320','--select-bg':'#FDF7F5',
      '--toast-bg':'rgba(255,241,236,.95)','--toast-fg':'#2E2320','--toast-border':'#F0DFDA',
      '--axis':'#6B5F57','--grid':'#F0DFDA','--spike':'#6B5F57','--hoverlabel-bg':'#FDF7F5','--hoverlabel-fg':'#2E2320',
      '--line-right':'#E07A5F','--line-left':'#6BA8C7'
    }},
    { name:'沙滩日光', swatch:'#F8E1A8', vars:{
      '--bg':'#FFF8E6','--fg':'#2E2A20','--muted':'#7A6E5A','--header-bg':'rgba(255,248,230,.85)',
      '--card-bg':'#FFFFFF','--border':'#F1E4C6','--btn-bg':'#FAF1DA','--btn-bg-hover':'#F4E8CB','--btn-fg':'#2E2A20',
      '--primary':'#F2C14E','--primary-hover':'#E6B53E','--primary-fg':'#3A2F0B','--chip-bg':'#F5ECD5',
      '--plot-bg':'rgba(0,0,0,0)','--overlay-bg':'rgba(250,241,218,.95)','--overlay-border':'#F1E4C6','--overlay-fg':'#8B5E2B',
      '--magnifier-bg':'#FFFFFF','--magnifier-border':'#F1E4C6','--magnifier-fg':'#2E2A20','--select-bg':'#FFF3D1',
      '--toast-bg':'rgba(250,241,218,.95)','--toast-fg':'#2E2A20','--toast-border':'#F1E4C6',
      '--axis':'#7A6E5A','--grid':'#F1E4C6','--spike':'#7A6E5A','--hoverlabel-bg':'#FFF3D1','--hoverlabel-fg':'#2E2A20',
      '--line-right':'#D97706','--line-left':'#0EA5A8'
    }},
    { name:'低蓝护眼', swatch:'#EAF2FF', vars:{
      '--bg':'#F5F7FB','--fg':'#1F2937','--muted':'#475569','--header-bg':'rgba(245,247,251,.85)',
      '--card-bg':'#FFFFFF','--border':'#E5E7EB','--btn-bg':'#EEF2F7','--btn-bg-hover':'#E6EBF3','--btn-fg':'#1F2937',
      '--primary':'#7AA2F7','--primary-hover':'#6E95EA','--primary-fg':'#0F172A','--chip-bg':'#EEF2F7',
      '--plot-bg':'rgba(0,0,0,0)','--overlay-bg':'rgba(238,242,247,.95)','--overlay-border':'#E5E7EB','--overlay-fg':'#334155',
      '--magnifier-bg':'#FFFFFF','--magnifier-border':'#E5E7EB','--magnifier-fg':'#1F2937','--select-bg':'#F2F5FA',
      '--toast-bg':'rgba(238,242,247,.95)','--toast-fg':'#1F2937','--toast-border':'#E5E7EB',
      '--axis':'#475569','--grid':'#E5E7EB','--spike':'#475569','--hoverlabel-bg':'#F2F5FA','--hoverlabel-fg':'#1F2937',
      '--line-right':'#7C8CF8','--line-left':'#4FB3D8'
    }},
    { name:'砂岩浅灰', swatch:'#CBBCA9', vars:{
      '--bg':'#F1ECE4','--fg':'#2B2723','--muted':'#5C5248','--header-bg':'rgba(241,236,228,.85)',
      '--card-bg':'#F9F5EF','--border':'#D9D0C4','--btn-bg':'#EDE5DA','--btn-bg-hover':'#E4DACD','--btn-fg':'#2B2723',
      '--primary':'#B8A58F','--primary-hover':'#A8957E','--primary-fg':'#2A2217','--chip-bg':'#EDE3D7',
      '--plot-bg':'rgba(0,0,0,0)','--overlay-bg':'rgba(238,229,218,.95)','--overlay-border':'#D9D0C4','--overlay-fg':'#5F4A36',
      '--magnifier-bg':'#FFFFFF','--magnifier-border':'#D9D0C4','--magnifier-fg':'#2B2723','--select-bg':'#F2EAE0',
      '--toast-bg':'rgba(238,229,218,.95)','--toast-fg':'#2B2723','--toast-border':'#D9D0C4',
      '--axis':'#5C5248','--grid':'#D9D0C4','--spike':'#5C5248','--hoverlabel-bg':'#F2EAE0','--hoverlabel-fg':'#2B2723',
      '--line-right':'#7E624F','--line-left':'#5F7D91'
    }},
    { name:'暖夜深蓝', swatch:'#1A3FA5', vars:{
      '--bg':'#0B1220','--fg':'#E6EEF8','--muted':'#9AA7B6','--header-bg':'rgba(11,18,32,.85)',
      '--card-bg':'#0F172A','--border':'rgba(255,255,255,.12)','--btn-bg':'#182234','--btn-bg-hover':'#1E2A44','--btn-fg':'#E6EEF8',
      '--primary':'#2563EB','--primary-hover':'#1D4ED8','--primary-fg':'#FFFFFF','--chip-bg':'#111827',
      '--plot-bg':'rgba(0,0,0,0)','--overlay-bg':'rgba(17,24,39,.9)','--overlay-border':'rgba(255,255,255,.12)','--overlay-fg':'#FBBF24',
      '--magnifier-bg':'#0F172A','--magnifier-border':'rgba(255,255,255,.12)','--magnifier-fg':'#E6EEF8','--select-bg':'#111827',
      '--toast-bg':'rgba(0,0,0,.6)','--toast-fg':'#FFFFFF','--toast-border':'rgba(255,255,255,.08)',
      '--axis':'#CBD5E1','--grid':'#1F2937','--spike':'#CBD5E1','--hoverlabel-bg':'#111827','--hoverlabel-fg':'#E6EEF8',
      '--line-right':'#F59E0B','--line-left':'#60A5FA'
    }},
    { name:'暗夜墨黑', swatch:'#111315', vars:{
      '--bg':'#0E0F12','--fg':'#EAEAEA','--muted':'#B8BDC7','--header-bg':'rgba(14,15,18,.85)',
      '--card-bg':'#15171C','--border':'#23262E','--btn-bg':'#1C2029','--btn-bg-hover':'#202533','--btn-fg':'#EAEAEA',
      '--primary':'#8BB9F1','--primary-hover':'#79A7E5','--primary-fg':'#101520','--chip-bg':'#1C2029',
      '--plot-bg':'rgba(0,0,0,0)','--overlay-bg':'rgba(28,32,41,.95)','--overlay-border':'#23262E','--overlay-fg':'#FBBF24',
      '--magnifier-bg':'#15171C','--magnifier-border':'#23262E','--magnifier-fg':'#EAEAEA','--select-bg':'#15171C',
      '--toast-bg':'rgba(28,32,41,.95)','--toast-fg':'#EAEAEA','--toast-border':'#23262E',
      '--axis':'#B8BDC7','--grid':'#23262E','--spike':'#B8BDC7','--hoverlabel-bg':'#101520','--hoverlabel-fg':'#EAEAEA',
      '--line-right':'#F59E0B','--line-left':'#60A5FA'
    }}
  ]

  function applyTheme(idx){
    const th = THEMES[idx] || THEMES[0]
    const root = document.documentElement
    Object.entries(th.vars).forEach(([k,v])=> root.style.setProperty(k, v))
  }

  async function openFile(){
    if(!window.electronAPI){ alert('系统接口不可用，请重启应用'); return }
    const res = await window.electronAPI.openFileDialog()
    if (res.canceled || res.filePaths.length===0) return
    const fp = res.filePaths[0]
    let cleaned = []
    try{
      const rf = await window.electronAPI.readFileBuffer(fp)
      if(!rf.ok){ alert('读取文件失败: '+rf.error); return }
      const workbook = XLS.read(rf.data, {type:'buffer'})
      const sheetName = workbook.SheetNames && workbook.SheetNames[0]
      if(!sheetName) throw new Error('Excel 文件没有可读取的工作表')
      const sheet = workbook.Sheets[sheetName]
      const json = XLS.utils.sheet_to_json(sheet, {header:1, raw:false})
      const rows = json.map(r=>({Item: r[0]||'', Param: (r[1]||'').toString(), Value: (r[2]||'').toString()}))
      cleaned = rows.filter(r=>r.Item||r.Param||r.Value)
    }catch(e){
      setFilePath(null)
      setRawRows([])
      setBasicInfo({})
      setCurrent(0)
      setAnnotations({})
      setFvepAnnotations({})
      setOpsMarks({})
      setOpsManualSum({})
      setOpsDataFrames({})
      setOpsMode({R:{op:null, kind:null}, L:{op:null, kind:null}})
      setGroups([])
      await window.electronAPI.showWarning('Excel解析失败：' + (e && e.message ? e.message : '请确认文件未损坏且为OPTOPROBE导出格式'))
      return
    }
    setFilePath(fp)
    setRawRows(cleaned)
    const valid = isValidERG(cleaned)
    if(!valid){
      // reset view and warn
      setFilePath(null)
      setBasicInfo({})
      setCurrent(0)
      setAnnotations({})
      setFvepAnnotations({})
      setOpsMarks({})
      setOpsManualSum({})
      setOpsDataFrames({})
      setOpsMode({R:{op:null, kind:null}, L:{op:null, kind:null}})
      setGroups([])
      await window.electronAPI.showWarning('请选择标准的OPTOPROBE导出文件进行分析')
      return
    }
    const basic = extractBasic(cleaned)
    setBasicInfo(basic)
    parseGroups(cleaned)
    setCurrent(0)
    setAnnotations({})
    setFvepAnnotations({})
    setOpsMarks({})
    setOpsManualSum({})
    setOpsDataFrames({})
    setOpsMode({R:{op:null, kind:null}, L:{op:null, kind:null}})
  }

  function isValidERG(rows){
    if(!Array.isArray(rows) || rows.length===0) return false
    const hasHospital = rows.some(r=> /\[医院_医院名字\]/.test(r.Param))
    const hasData = rows.some(r=> /\[?[RL]_0?\d+_详细数据\(uv\)\]?/i.test(r.Param))
    const hasGroup = rows.some(r=> /^\[?[RL]_0?\d+_.+\]?$/i.test(r.Param))
    return Boolean(hasHospital && hasData && hasGroup)
  }

  function extractBasic(rows){
    const map = new Map(rows.map(r=>[r.Param, r.Value]))
    const get = (k)=> sanitizeText(map.get(k)||'')
    return {
      检查项目: get('[检查项目]')||get('检查项目')||get('Item')||'',
      医院: get('[医院_医院名字]')||'',
      病人: get("'[病人_姓名]")|| get('[病人_姓名]') ||'',
      检查日期: get('[检查_检查日期]')||''
    }
  }

  function parseGroups(rows){
    const groupsFound = {}
    const re = /^([rl])_(0?\d+)_(.+)$/i
    rows.forEach(r=>{
      const raw = r.Param || ''
      const param = raw.trim().replace(/^\[|\]$/g,'')
      const m = re.exec(param)
      if(m){
        const side = m[1].toUpperCase()
        const idx = m[2]
        const suffix = m[3]
        const key = idx
        if(!groupsFound[key]) groupsFound[key] = { idx: Number(idx), R:{}, L:{} }
        const val = suffix==='标记' ? sanitizeMark(r.Value) : sanitizeText(r.Value)
        groupsFound[key][side][suffix] = val
      }
    })
    const arr = Object.values(groupsFound).sort((a,b)=>a.idx-b.idx)
    setGroups(arr)
  }

  const currentGroup = groups[current]
  const hasValid = Array.isArray(groups) && groups.length > 0
  const showR = (()=>{
    const s = currentGroup?.R?.['详细数据(uv)']
    return Array.isArray(s) ? s.length>0 : (s? String(s).trim().length>0 : false)
  })()
  const showL = (()=>{
    const s = currentGroup?.L?.['详细数据(uv)']
    return Array.isArray(s) ? s.length>0 : (s? String(s).trim().length>0 : false)
  })()
  const [uiSizes, setUiSizes] = useState(null)
  const lastColsMode = useRef(null)
  // 固定高度（OPS），仅按列布局调整宽度
  const fixedAppliedRef = useRef(false)
  const fixedHeightRef = useRef(null)
  // Mode flags computed early for resize effect
  const enableAnnotate = (()=>{
    const nameR = currentGroup?.R?.['名字']||''
    const nameL = currentGroup?.L?.['名字']||''
    const targets = ['dRod','dMax','lCone']
    return targets.some(t=>nameR.includes(t) || nameL.includes(t))
  })()
  const isDops = (()=>{
    const nameR = currentGroup?.R?.['名字']||''
    const nameL = currentGroup?.L?.['名字']||''
    return nameR.includes('dOps') || nameL.includes('dOps')
  })()
  const isFlicker = (()=>{
    const nameR = currentGroup?.R?.['名字']||''
    const nameL = currentGroup?.L?.['名字']||''
    return /flicker/i.test(nameR) || /flicker/i.test(nameL)
  })()
  const isFVEP = (()=>{
    const nameR = currentGroup?.R?.['名字']||''
    const nameL = currentGroup?.L?.['名字']||''
    return /FVEP/i.test(nameR) || /FVEP/i.test(nameL) || /FVEP/i.test(basicInfo?.检查项目||'')
  })()

  useEffect(()=>{ (async()=>{
    if(window.electronAPI?.getUiSizes){
      const ret = await window.electronAPI.getUiSizes()
      if(ret?.ok && ret.data) setUiSizes(ret.data)
    }
  })() },[])

  // 一次性：设置窗口高度为 OPS 高度并居中；不再按模式动态调整高度
  useEffect(()=>{
    if(!uiSizes || !window.electronAPI?.resizeWindow) return
    if(fixedAppliedRef.current) return
    const w = (uiSizes.main && (uiSizes.main.expanded?.width || uiSizes.main.single?.width || uiSizes.main.compact?.width)) || 1200
    const h = (uiSizes.modes && uiSizes.modes.dOps) || (uiSizes.main && (uiSizes.main.expanded?.height || uiSizes.main.single?.height || uiSizes.main.compact?.height)) || 755
    try{ window.electronAPI.resizeWindow(w, h) }catch(_e){}
    try{ window.electronAPI.centerWindow && window.electronAPI.centerWindow() }catch(_e){}
    fixedAppliedRef.current = true
    fixedHeightRef.current = h
    // initialize last dims
    try{ lastDimsRef.current = { w, h } }catch(_e){}
  }, [uiSizes])

  const lastDimsRef = useRef({ w: null, h: null })

  // Width-only adjustment: when only单眼显示时，减小窗口宽度；双眼/紧凑时恢复相应宽度。高度固定为OPS高度。
  useEffect(()=>{
    if(!uiSizes || !window.electronAPI?.resizeWindow) return
    if(!fixedAppliedRef.current) return
    const colsMode = !hasValid ? 'compact' : ((showR && showL) ? 'both' : 'single')
    const base = colsMode==='compact' ? uiSizes.main.compact : (colsMode==='single' ? (uiSizes.main.single||uiSizes.main.expanded) : uiSizes.main.expanded)
    const desiredW = (base && base.width) || (colsMode==='single'? 880 : 1250)
    const desiredH = fixedHeightRef.current || (uiSizes.modes?.dOps || 755)
    const prev = lastDimsRef.current
    const prevCols = lastColsMode.current
    if(prev && prev.w === desiredW && prev.h === desiredH && prevCols === colsMode) return
    try{ window.electronAPI.resizeWindow(desiredW, desiredH) }catch(_e){}
    lastDimsRef.current = { w: desiredW, h: desiredH }
    lastColsMode.current = colsMode
    if(prevCols && prevCols !== colsMode){ try{ window.electronAPI.centerWindow && window.electronAPI.centerWindow() }catch(_e){} }
  }, [uiSizes, hasValid, showR, showL])
  const annoting = Boolean(annotMode.R || annotMode.L || (opsMode.R && opsMode.R.kind) || (opsMode.L && opsMode.L.kind))

  // removed peer usage sync

  // Current high-level mode key for Y-range persistence across groups
  const modeKey = (isDops ? 'dOps' : (isFlicker ? 'lFlicker' : (isFVEP ? 'FVEP' : (enableAnnotate ? 'ab' : 'other'))))

  function onAnnotateClick(side, which){
    setAnnotMode(prev=>{
      const now = prev[side]===which? null : which
      // when starting, disable other side too
      return { R: side==='R'? now : null, L: side==='L'? now : null }
    })
  }

  function onPointPicked({side, x, y, mode}){
    if(!currentGroup) return
    const gid = currentGroup.idx
    if(mode==='a' || mode==='b'){
      setAnnotations(prev=>{
        const gprev = prev[gid] || {R:{},L:{}}
        const next = {...prev, [gid]: {...gprev, [side]: {...gprev[side], [mode]: {x,y}} } }
        return next
      })
      setAnnotMode({R:null,L:null})
    } else if(mode==='N1' || mode==='P1' || mode==='N2' || mode==='P2'){
      setFvepAnnotations(prev=>{
        const cur = prev[gid] || {R:{},L:{}}
        const sideObj = cur[side] || {}
        const nextSide = { ...sideObj, [mode]: { x, y } }
        return { ...prev, [gid]: { ...cur, [side]: nextSide } }
      })
      setAnnotMode({R:null,L:null})
    } else if(mode==='opP' || mode==='opV'){
      const kind = mode==='opP' ? 'peak' : 'valley'
      const opIndex = opsMode[side].op
      if(opIndex==null) return
      setOpsMarks(prev=>{
        const g = prev[gid] || emptyOpsMarks()
        const arr = (g[side] || emptyOpsMarkList()).map(c=>({...c}))
        const col = {...(arr[opIndex]||{})}
        col[kind] = {x,y}
        arr[opIndex] = col
        return {...prev, [gid]: {...g, [side]: arr} }
      })
      // Update dataframe with y value
      setOpsDataFrames(prev=>{
        const cur = prev[gid] || emptyOpsDataFrame()
        const sideDf = cur[side] || emptyOpsDataFrame()[side]
        const nextDf = { ...cur, [side]: { peak: sideDf.peak.slice(), trough: sideDf.trough.slice() } }
        if(kind==='peak') nextDf[side].peak[opIndex] = Number(y)
        else nextDf[side].trough[opIndex] = Number(y)
        return { ...prev, [gid]: nextDf }
      })
      // Clear armed state after picking one point
      setOpsMode(prev=>({ ...prev, [side]: { op: prev[side].op, kind: null } }))
    }
  }

  function onHoverPoint(evt){
    // Only when some annotate active
    const inOpsArmed = Boolean(opsMode.R.kind || opsMode.L.kind)
    if(!(annotMode.R || annotMode.L || inOpsArmed)) return
    try{ if(magnifyTimerRef.current){ clearTimeout(magnifyTimerRef.current); magnifyTimerRef.current = null } }catch(_e){}
    try{ if(magnifyArmRef.current){ clearTimeout(magnifyArmRef.current); magnifyArmRef.current = null } }catch(_e){}
    magnifyArmRef.current = setTimeout(()=>{
      setMagnify({side: evt.side, sx: evt.sx, sy: evt.sy, center: evt.center, idx: evt.idx, x: evt.x, y: evt.y})
      setSuppressSpikes(true) // hide spikes in main plot while locked on point
      magnifyArmRef.current = null
    }, 10)
  }

  function onHoverEnd(){
    try{ if(magnifyTimerRef.current){ clearTimeout(magnifyTimerRef.current); magnifyTimerRef.current = null } }catch(_e){}
    try{ if(magnifyArmRef.current){ clearTimeout(magnifyArmRef.current); magnifyArmRef.current = null } }catch(_e){}
    // re-enable spikes in main plot after leaving point
    setSuppressSpikes(false)
    magnifyTimerRef.current = setTimeout(()=>{ setMagnify(null); magnifyTimerRef.current = null }, 500)
  }

  useEffect(()=>{
    return ()=>{ try{ if(magnifyTimerRef.current){ clearTimeout(magnifyTimerRef.current); magnifyTimerRef.current = null } }catch(_e){}; try{ if(magnifyArmRef.current){ clearTimeout(magnifyArmRef.current); magnifyArmRef.current = null } }catch(_e){} }
  },[])

  function Magnifier(){
    const ref = useRef(null)
    // derive annotate state for the side shown in magnifier
    const sideForMag = magnify && magnify.side
    const magActiveAnnotate = (()=>{
      if(!sideForMag) return null
      if(annotMode && annotMode[sideForMag]) return annotMode[sideForMag]
      if(opsMode && opsMode[sideForMag] && opsMode[sideForMag].kind){
        return opsMode[sideForMag].kind==='peak' ? 'opP' : 'opV'
      }
      return null
    })()
    const magMarking = Boolean(opsMode && ((opsMode.R && opsMode.R.kind) || (opsMode.L && opsMode.L.kind)))
    useEffect(()=>{
      if(!ref.current || !magnify) return
      const P = PL
      const sx = magnify.sx||[]
      const sy = magnify.sy||[]
      const center = magnify.center||0
      const markerX = sx[center]
      const markerY = sy[center]
      const data = [
        { x: sx, y: sy, type:'scatter', mode:'markers', marker:{size:6, color:'#cfe1ff'}, hoverinfo:'skip', showlegend:false },
        { x: [markerX], y: [markerY], type:'scatter', mode:'markers', marker:{size:9, color:'#f59e0b'}, hoverinfo:'skip', showlegend:false }
      ]
      const rs = getComputedStyle(document.documentElement)
      const fg = rs.getPropertyValue('--fg').trim() || '#000000'
      const axis = rs.getPropertyValue('--axis').trim() || fg
      const spikeColor = rs.getPropertyValue('--spike').trim() || axis
      const spikesOn = Boolean(magActiveAnnotate || magMarking)
      const layout = {
        margin:{l:30,r:10,t:10,b:24},
        paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{color: fg},
        hovermode:'closest', clickmode:'event+select',
        hoverdistance: spikesOn? 1 : 20, spikedistance: spikesOn? -1 : 20,
        xaxis:{color: axis, zeroline:false, showgrid:false, showline:true, linecolor: axis, linewidth:1, showspikes: spikesOn, spikemode:'across', spikesnap:'cursor', spikethickness:2, spikecolor: spikeColor},
        yaxis:{color: axis, zeroline:false, showgrid:false, showspikes: spikesOn, spikemode:'across', spikesnap:'cursor', spikethickness:2, spikecolor: spikeColor}
      }
      P.react(ref.current, data, layout, {displayModeBar:false,responsive:true})
      // visual hint for clickability
      try{ ref.current.style.cursor = 'crosshair' }catch(_e){}
      // Enable click picking inside magnifier
      const div = ref.current
      const onHover = (e)=>{
        if(!e || !e.points || !e.points.length) return
        const pt = e.points[0]
        const hx = Number(pt.x), hy = Number(pt.y)
        try{ P.restyle(div, {x:[[hx]], y:[[hy]]}, [1]) }catch(_e){}
        setMagnify(prev=> prev? ({...prev, x: hx, y: hy}) : prev)
      }
      const onClick = (e)=>{
        if(!e || !e.points || !e.points.length) return
        const pt = e.points[0]
        const localIdx = typeof pt.pointNumber==='number' ? pt.pointNumber : null
        let cx = Number(pt.x)
        let cy = Number(pt.y)
        // Map back to global index when possible for exact data alignment
        if(localIdx!=null && magnify && Number.isFinite(magnify.idx) && Number.isFinite(magnify.center)){
          const globalIdx = (magnify.idx - magnify.center) + localIdx
          if(Array.isArray(x) && Array.isArray(y) && globalIdx>=0 && globalIdx < y.length){
            cx = Number(x[globalIdx])
            cy = Number(y[globalIdx])
          }
        }
        const side = magnify.side
        const mode = magActiveAnnotate || null
        if(mode && onPointPicked){ onPointPicked({ side, x: cx, y: cy, mode }); onHoverEnd && onHoverEnd() }
      }
      try{ div.removeAllListeners && div.removeAllListeners('plotly_hover') }catch(_e){}
      try{ div.removeAllListeners && div.removeAllListeners('plotly_click') }catch(_e){}
      div.on && div.on('plotly_hover', onHover)
      div.on && div.on('plotly_click', onClick)
      return ()=>{
        try{ div.removeAllListeners && div.removeAllListeners('plotly_hover') }catch(_e){}
        try{ div.removeAllListeners && div.removeAllListeners('plotly_click') }catch(_e){}
      }
    }, [magnify, magActiveAnnotate, magMarking, onPointPicked, onHoverEnd])
    if(!magnify) return null
    return R.createElement('div',{className:'magnifier', onMouseEnter:()=>{
        try{ if(magnifyTimerRef.current){ clearTimeout(magnifyTimerRef.current); magnifyTimerRef.current = null } }catch(_e){}
      }, onMouseLeave:()=>{
        try{ if(magnifyTimerRef.current){ clearTimeout(magnifyTimerRef.current); magnifyTimerRef.current = null } }catch(_e){}
        magnifyTimerRef.current = setTimeout(()=>{ setMagnify(null); magnifyTimerRef.current = null }, 500)
      }},[
      R.createElement('div',{className:'magnifier-header'},[
        R.createElement('div',null, cnEye(magnify.side)),
        R.createElement('div',null, `${Number(magnify.x).toFixed(2)} ms, ${Number(magnify.y).toFixed(2)} μv`)
      ]),
      R.createElement('div',{className:'magnifier-body'},
        R.createElement('div',{className:'magnifier-plot', ref})
      )
    ])
  }

  function abMarksFor(side){
    const name = currentGroup?.[side]?.['名字']||''
    const mark = currentGroup?.[side]?.['标记']||''
    return splitAB(name, mark)
  }

  function defaultBaseName(side){
    const friendly = buildFriendlyName(side, currentGroup)
    const safe = (friendly||'curve').replace(/[^\w\-_.]/g,'_')
    return safe
  }

  async function exportImage(side, fmt, plotDiv){
    // Prefer explicit plot element passed from PlotPanel; fallback to index
    let idiv = plotDiv
    if(!idiv){
      const list = document.querySelectorAll('.plot')
      // If both眼显示，顺序为 R(0), L(1)；若仅单眼，唯一元素应为 index 0
      if(list.length===1){ idiv = list[0] }
      else { idiv = list[ side==='R'?0:1 ] }
    }
    if(!idiv){ return }
    const P = PL
    if(!P){ alert('图形库未加载'); return }
    // Footer rows builder: construct rows like [['', '机器识别结果', '手动标注结果'], ['a-wave', '...', '...'], ...]
    function buildFooterRowsForSide(){
      const headerAB = ['', '机器识别结果', '手动标注结果']
      const headerCalc = ['', '机器识别结果', '从头计算结果']
      if(enableAnnotate && !isFlicker && !isFVEP && !isDops){
        const gid = currentGroup?.idx
        const vals = (gid && annotations[gid]) || {R:{},L:{}}
        const marks = abMarksFor(side)
        const a = vals?.[side]?.a || null
        const b = vals?.[side]?.b || null
        let bText = '—'
        if(b){
          const by = (a && typeof a.y==='number' && typeof b.y==='number') ? (b.y - a.y) : b.y
          bText = `${Number(b.x).toFixed(2)} ms, ${Number(by).toFixed(2)} μv`
        }
        return {
          header: headerAB,
          rows: [
            ['a-wave', marks? formatMarkToXY(marks.a) : '—', a? `${Number(a.x).toFixed(2)} ms, ${Number(a.y).toFixed(2)} μv` : '—'],
            ['b-wave', marks? formatMarkToXY(marks.b) : '—', bText]
          ]
        }
      }
      if(isFlicker){
        const meta = currentGroup?.[side] || {}
        const mark = meta['标记'] || ''
        const y = parseY(meta['详细数据(uv)'])
        const timeMs = Number((meta['分析时间']||'').toString().replace(/[^\d.]/g,'')) || 0
        const fHz = guessFlickerHz(meta)
        const calc = computeFlickerAmpPhaseFromWave(y, timeMs, fHz)
        const { amp, phase } = parseFlickerAmpPhase(mark)
        const ampText = (amp!=null) ? `${Number(amp).toFixed(1)} μv` : '—'
        const phaseText = (phase!=null) ? `${Number(phase).toFixed(1)}°` : '—'
        const cAmpText = (calc && Number.isFinite(calc.ampPP)) ? `${calc.ampPP.toFixed(1)} μv` : '—'
        const cPhaseText = (calc && Number.isFinite(calc.phaseDeg)) ? `${Math.abs(calc.phaseDeg).toFixed(1)}°` : '—'
        return { header: headerCalc, rows: [ ['幅值', ampText, cAmpText], ['相位', phaseText, cPhaseText] ] }
      }
      if(isFVEP){
        const labels = ['N1','P1','N2','P2']
        const mark = currentGroup?.[side]?.['标记'] || ''
        const parsed = parseFVEPMark(mark)
        const gid = currentGroup?.idx
        const manual = (gid && fvepAnnotations[gid] && fvepAnnotations[gid][side]) || {}
        const rows = labels.map(lbl=>{
          const v = parsed[lbl]
          const mTxt = (v && v.t!=null && v.a!=null) ? `${Number(v.t).toFixed(1)} ms, ${Number(v.a).toFixed(1)} μv` : '—'
          const p = manual[lbl]
          const uTxt = (p && p.x!=null && p.y!=null) ? `${Number(p.x).toFixed(1)} ms, ${Number(p.y).toFixed(1)} μv` : '—'
          return [lbl, mTxt, uTxt]
        })
        return { header: ['', '机器识别结果', '手动标注结果'], rows }
      }
      if(isDops){
        const gid = currentGroup?.idx
        const machine = (()=>{ const mark = currentGroup?.[side]?.['标记']||''; const nums = numbers2(mark); return nums.length>0 ? `${nums[0].toFixed(1)} μv` : '—' })()
        const manual = (gid && opsManualSum[gid] && opsManualSum[gid][side]!=null) ? `${Number(opsManualSum[gid][side]).toFixed(1)} μv` : '—'
        return { header: ['', '机器识别结果', '手动标注结果'], rows: [['∑O', machine, manual]] }
      }
      return null
    }

    async function composePngWithFooter(baseUrl){
      const footer = buildFooterRowsForSide()
      if(!footer) return baseUrl
      // base chart assumed 900x600 in toImage below; compute footer height by rows
      const rowH = 22
      const pad = 16
      const headerH = rowH
      const bodyH = footer.rows.length * rowH
      const footH = pad + headerH + bodyH + pad
      const W = 900, H = 600
      const outW = W
      const outH = H + footH
      const img = new Image()
      img.src = baseUrl
      await new Promise((res,rej)=>{ img.onload = res; img.onerror = rej })
      const cvs = document.createElement('canvas')
      cvs.width = outW; cvs.height = outH
      const ctx = cvs.getContext('2d')
      // draw base chart
      ctx.drawImage(img, 0, 0, W, H)
      // theme colors
      const rs = getComputedStyle(document.documentElement)
      const cardBg = rs.getPropertyValue('--card-bg').trim() || '#fff'
      const border = rs.getPropertyValue('--border').trim() || '#ddd'
      const fg = rs.getPropertyValue('--fg').trim() || '#222'
      // draw footer background
      ctx.fillStyle = cardBg
      ctx.fillRect(0, H, outW, footH)
      ctx.strokeStyle = border
      ctx.strokeRect(0.5, H+0.5, outW-1, footH-1)
      // table metrics
      const col0 = 90
      const colW = (outW - col0) / 2
      let y = H + pad + rowH*0.8
      ctx.font = '12px Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica Neue,Arial'
      ctx.fillStyle = fg
      ctx.textBaseline = 'middle'
      // header
      ctx.fillText(footer.header[0], 12, y)
      ctx.fillText(footer.header[1], col0 + 12, y)
      ctx.fillText(footer.header[2], col0 + colW + 12, y)
      y += rowH
      // rows
      footer.rows.forEach(r=>{
        ctx.fillText(r[0], 12, y)
        ctx.fillText(r[1], col0 + 12, y)
        ctx.fillText(r[2], col0 + colW + 12, y)
        y += rowH
      })
      return cvs.toDataURL('image/png')
    }

    function appendFooterToSvg(svgText){
      const footer = buildFooterRowsForSide()
      if(!footer) return svgText
      // Extract width/height
      const mW = /width=["'](\d+(?:\.\d+)?)["']/i.exec(svgText)
      const mH = /height=["'](\d+(?:\.\d+)?)["']/i.exec(svgText)
      let W = mW? Number(mW[1]) : 900
      let H = mH? Number(mH[1]) : 600
      const rowH = 16
      const pad = 12
      const headerH = rowH
      const bodyH = footer.rows.length * rowH
      const footH = pad + headerH + bodyH + pad
      const outH = H + footH
      const col0 = 90
      const col1x = col0
      const col2x = col0 + (W - col0)/2
      let y = H + pad + rowH
      // build svg group
      let g = ''
      g += `<rect x='0.5' y='${H+0.5}' width='${W-1}' height='${footH-1}' fill='${escapeHtml(getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim()||'#fff')}' stroke='${escapeHtml(getComputedStyle(document.documentElement).getPropertyValue('--border').trim()||'#ddd')}' />`
      const fg = (getComputedStyle(document.documentElement).getPropertyValue('--fg').trim()||'#222')
      const tx = (x, yy, text)=>`<text x='${x+12}' y='${yy}' fill='${escapeHtml(fg)}' font-size='12' dominant-baseline='middle'>${escapeHtml(text)}</text>`
      // header
      g += tx(0, y, footer.header[0])
      g += tx(col1x, y, footer.header[1])
      g += tx(col2x, y, footer.header[2])
      y += rowH
      footer.rows.forEach(r=>{ g += tx(0, y, r[0]); g += tx(col1x, y, r[1]); g += tx(col2x, y, r[2]); y += rowH })
      // inject and update height
      let out = svgText.replace(/height=["']\d+(?:\.\d+)?["']/i, `height='${outH}'`)
      // viewBox adjust if present
      out = out.replace(/viewBox=["']\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i, (m,x0,y0,w,h)=>`viewBox='${x0} ${y0} ${w} ${Number(h)+footH}'`)
      out = out.replace(/<\/svg>\s*$/, `${g}</svg>`)
      return out
    }
    if(fmt==='copy'){
      const baseUrl = await P.toImage(idiv, {format:'png', height:600, width:900, scale:2})
      const url = await composePngWithFooter(baseUrl)
      const r = await window.electronAPI.clipboardWriteImageDataURL(url)
      if(!r?.ok){ alert('复制失败: '+(r?.error||'')); return { ok:false, error: r?.error||'clipboard failed' } }
      return { ok:true }
    }
    if(fmt==='png'){
      const baseUrl = await P.toImage(idiv, {format: 'png', height:600, width:900, scale:2})
      const url = await composePngWithFooter(baseUrl)
      const def = defaultBaseName(side)
      const res = await window.electronAPI.saveDialog({ title: '保存图像', defaultPath: `${def}.png`, filters:[{name:'PNG', extensions:['png']}] })
      if(res.canceled || !res.filePath) return
      const base64 = url.split(',')[1]
      const ok = await window.electronAPI.writeFile(res.filePath, {type:'base64', data: base64})
      if(!ok?.ok) alert('保存失败: '+(ok?.error||''))
      return
    }
    if(fmt==='svg'){
      const url = await P.toImage(idiv, {format:'svg', height:600, width:900, scale:1})
      const commaIdx = url.indexOf(',')
      let svgText = decodeURIComponent(url.slice(commaIdx+1))
      svgText = appendFooterToSvg(svgText)
      const def = defaultBaseName(side)
      const res = await window.electronAPI.saveDialog({ title: '保存图像', defaultPath: `${def}.svg`, filters:[{name:'SVG', extensions:['svg']}] })
      if(res.canceled || !res.filePath) return
      const ok = await window.electronAPI.writeFile(res.filePath, svgText, 'utf8')
      if(!ok?.ok) alert('保存失败: '+(ok?.error||''))
      return
    }
    if(fmt==='pdf'){
      // Vector PDF path: export SVG then print inline SVG to PDF
      const svgDataUrl = await P.toImage(idiv, {format:'svg', height:600, width:900, scale:1})
      const commaIdx = svgDataUrl.indexOf(',')
      let svgText = decodeURIComponent(svgDataUrl.slice(commaIdx+1))
      // For PDF, we can keep footer as HTML below the SVG for better fidelity
      const footer = buildFooterRowsForSide()
      let footHtml = ''
      if(footer){
        const table = [
          `<table style="font:12px/1.4 Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica Neue,Arial;border-collapse:collapse;">`,
          `<tr><th style='text-align:left;padding:4px 8px;'></th><th style='text-align:left;padding:4px 8px;'>${escapeHtml(footer.header[1])}</th><th style='text-align:left;padding:4px 8px;'>${escapeHtml(footer.header[2])}</th></tr>`,
          ...footer.rows.map(r=>`<tr><td style='padding:4px 8px;'>${escapeHtml(r[0])}</td><td style='padding:4px 8px;'>${escapeHtml(r[1])}</td><td style='padding:4px 8px;'>${escapeHtml(r[2])}</td></tr>`),
          `</table>`
        ].join('')
        const pdfCardBg = escapeHtml(getComputedStyle(document.documentElement).getPropertyValue('--card-bg').trim()||'#fff')
        const pdfBorder = escapeHtml(getComputedStyle(document.documentElement).getPropertyValue('--border').trim()||'#ddd')
        footHtml = `<div style='padding:12px 8px;background:${pdfCardBg};border:1px solid ${pdfBorder};border-radius:10px;margin-top:8px;'>${table}</div>`
      }
      const html = `<!doctype html><html><head><meta charset='utf-8'><style>
        html,body{margin:0;padding:0;background:#fff}
        .wrap{display:flex;align-items:center;justify-content:center}
        .pad{padding:24px}
        svg{height:auto;max-width:95vw;max-height:95vh}
      </style></head><body><div class='wrap'><div class='pad'>${svgText}${footHtml}</div></div></body></html>`
      const def = defaultBaseName(side)
      const res = await window.electronAPI.saveDialog({ title: '导出 PDF（矢量）', defaultPath: `${def}.pdf`, filters:[{name:'PDF', extensions:['pdf']} ]})
      if(res.canceled || !res.filePath) return
      const r = await window.electronAPI.exportPdfFromHtml(html, res.filePath)
      if(!r.ok) alert('导出PDF失败: '+r.error)
      return
    }
  }

  function ThemeModal(){
    if(!themeOpen) return null
    const root = document.documentElement
    const previewColor = (t)=> t.swatch || t.vars['--primary']
    const modalStyle = {}
    if(uiSizes && uiSizes.theme && uiSizes.theme.width){ modalStyle.width = uiSizes.theme.width }
    if(uiSizes && uiSizes.theme && uiSizes.theme.height){ modalStyle.maxHeight = uiSizes.theme.height; modalStyle.overflow = 'auto' }
    return R.createElement('div',{className:'modal-mask', onClick:(e)=>{ if(e.target===e.currentTarget) setThemeOpen(false) }},
      R.createElement('div',{className:'modal', style: modalStyle},[
        R.createElement('div',{className:'modal-header'},
          R.createElement('div',{className:'modal-title'},'你更喜欢')
        ),
        R.createElement('div',{className:'modal-body'},[
          R.createElement('div',{className:'theme-grid'},
            THEMES.flatMap((t,idx)=>[
              R.createElement('div',{key:'n'+idx}, t.name),
              R.createElement('div',{key:'s'+idx, className:'swatch', style:{background: previewColor(t)}}),
              R.createElement('input',{key:'r'+idx, className:'radio', type:'radio', name:'theme', checked: themeIdx===idx, onChange:()=>{ setThemeIdx(idx); applyTheme(idx) }})
            ])
          )
        ]),
        R.createElement('div',{className:'modal-footer'},[
          R.createElement('button',{className:'btn btn-sm', onClick:()=>setThemeOpen(false)}, '关闭')
        ])
      ])
    )
  }

  async function exportData(side){
    const gd = currentGroup?.[side]||{}
    const name = gd['名字']||''
    const timeMs = Number((gd['分析时间']||'').toString().replace(/[^\d.]/g,'')) || 0
    const y = parseY(gd['详细数据(uv)'])
    const x = buildX(timeMs, y.length)
    const aoa = [['time (ms)','amplitude (μv)'], ...x.map((xi,i)=>[xi, y[i]??null])]
    const wb = XLS.utils.book_new()
    const ws = XLS.utils.aoa_to_sheet(aoa)
    XLS.utils.book_append_sheet(wb, ws, 'plot')
    const out = XLS.write(wb, {type:'array', bookType:'xlsx'})
    const def = defaultBaseName(side)
    const res = await window.electronAPI.saveDialog({ title:'导出绘图数据', defaultPath:`${def}.xlsx`, filters:[{name:'Excel', extensions:['xlsx']}] })
    if(res.canceled || !res.filePath) return
    const ok = await window.electronAPI.writeFile(res.filePath, out)
    if(!ok?.ok) alert('保存失败: '+(ok?.error||''))
  }

  function GroupInfo({g}){
    if(!g) return R.createElement('div',{className:'muted'},'未选择组')
    const keys = ['名字','放大器','闪光','闪光背景','采样','分析时间']
    const Rrows = keys.map(k=>({
      k,
      v: (k==='闪光'||k==='闪光背景') ? formatFlashToEnergyText(k, g.R?.[k]||'')
        : (k==='采样' ? formatSamplingField(g.R?.[k]||'') : (g.R?.[k]||''))
    }))
    const Lrows = keys.map(k=>({
      k,
      v: (k==='闪光'||k==='闪光背景') ? formatFlashToEnergyText(k, g.L?.[k]||'')
        : (k==='采样' ? formatSamplingField(g.L?.[k]||'') : (g.L?.[k]||''))
    }))
    return R.createElement(R.Fragment,null,[
      showR && R.createElement('div',{className:'card'},[
        R.createElement('h3',{style:{textAlign:'center'}}, cnEye('R')+'检测参数'),
        R.createElement(InfoKV,{rows:Rrows})
      ]),
      showL && R.createElement('div',{className:'card'},[
        R.createElement('h3',{style:{textAlign:'center'}}, cnEye('L')+'检测参数'),
        R.createElement(InfoKV,{rows:Lrows})
      ])
    ])
  }

  function MarkCardsRow(){
    const g = currentGroup
    const markR = abMarksFor('R')
    const markL = abMarksFor('L')
    const card = (side, marks)=> R.createElement('div',{className:'card'},[
      R.createElement('h3',null,`${cnEye(side)} 机器识别结果`),
      marks ? R.createElement('div',{className:'marks'},[
        R.createElement('div',null, 'a-wave'),
        R.createElement('div',null, formatMarkToXY(marks.a)),
        R.createElement('div',null, 'b-wave'),
        R.createElement('div',null, formatMarkToXY(marks.b))
      ]) : R.createElement('div',{className:'marks muted'}, g?.[side]?.['标记'] || '-')
    ])
    const items = []
    if(showR) items.push(card('R', markR))
    if(showL) items.push(card('L', markL))
    return R.createElement('div',{className:'two-col', style:{gridTemplateColumns: (showR && showL) ? '1fr 1fr' : '1fr'}}, items)
  }

  function CombinedEyeRows(){
    const gid = currentGroup?.idx
    const vals = (gid && annotations[gid]) || {R:{},L:{}}
    const makeCard = (side)=>{
      const marks = abMarksFor(side)
      const sideLabel = cnEye(side)
      return R.createElement('div',{className:'card'},[
        R.createElement('div',{className:'grid3'},[
          // row 1
          R.createElement('div',{className:'head'}, sideLabel),
          R.createElement('div',{className:'head'}, '机器识别结果'),
          R.createElement('div',{className:'head'}, '手动标注结果'),
          // row 2
          R.createElement('div',null, 'a-wave'),
          R.createElement('div',null, marks?formatMarkToXY(marks.a):'—'),
          R.createElement('div',null, vals[side]?.a?`${vals[side].a.x.toFixed(2)} ms, ${vals[side].a.y.toFixed(2)} μv`:'—'),
          // row 3
          R.createElement('div',null, 'b-wave'),
          R.createElement('div',null, marks?formatMarkToXY(marks.b):'—'),
          R.createElement('div',null, (()=>{
            const a = vals[side]?.a, b = vals[side]?.b
            if(!b) return '—'
            const by = (a && typeof a.y==='number' && typeof b.y==='number') ? (b.y - a.y) : b.y
            return `${b.x.toFixed(2)} ms, ${by.toFixed(2)} μv`
          })())
        ])
      ])
    }
    const items = []
    if(showR) items.push(makeCard('R'))
    if(showL) items.push(makeCard('L'))
    return R.createElement('div',{className:'two-col', style:{gridTemplateColumns: (showR && showL) ? '1fr 1fr' : '1fr'}}, items)
  }

  function opsMachineValue(side){
    const mark = currentGroup?.[side]?.['标记']||''
    const nums = numbers2(mark)
    if(nums.length>0){ return `${nums[0].toFixed(1)} μv` }
    return '—'
  }

  function DopsCombinedRows(){
    const gid = currentGroup?.idx
    const manual = opsManualSum[gid] || {}
    const makeRow = (side)=> R.createElement('div',{className:'card'},[
      R.createElement('div',{className:'grid3'},[
        R.createElement('div',{className:'head'}, cnEye(side)),
        R.createElement('div',{className:'head'}, '机器识别结果'),
        R.createElement('div',{className:'head'}, '手动标注结果'),
        R.createElement('div',null, '∑O'),
        R.createElement('div',null, opsMachineValue(side)),
        R.createElement('div',null, (manual && manual[side]!=null)? `${Number(manual[side]).toFixed(1)} μv` : '—')
      ])
    ])
    const items=[]
    if(showR) items.push(makeRow('R'))
    if(showL) items.push(makeRow('L'))
    return R.createElement('div',{className:'two-col', style:{gridTemplateColumns: (showR&&showL)?'1fr 1fr':'1fr'}}, items)
  }

  // lFlicker: 3x3 grid — 右/左眼 | 机器识别结果 | 手动标注结果
  // 第二行：幅值（文件中：数字 + ‘ μv’；手动：— 占位）
  // 第三行：相位（文件中：数字 + ‘°’；手动：— 占位）
  function FlickerCombinedRows(){
    const makeCard = (side)=>{
      const sideLabel = cnEye(side)
      const mark = currentGroup?.[side]?.['标记'] || ''
      const meta = currentGroup?.[side] || {}
      const y = parseY(meta['详细数据(uv)'])
      const timeMs = Number((meta['分析时间']||'').toString().replace(/[^\d.]/g,'')) || 0
      const fHz = guessFlickerHz(meta)
      const calc = computeFlickerAmpPhaseFromWave(y, timeMs, fHz)
      const { amp, phase } = parseFlickerAmpPhase(mark)
      const ampText = (amp!=null) ? `${amp.toFixed(1)} μv` : '—'
      const phaseText = (phase!=null) ? `${phase.toFixed(1)}°` : '—'
      const cAmpText = (calc && Number.isFinite(calc.ampPP)) ? `${calc.ampPP.toFixed(1)} μv` : '—'
      const cPhaseText = (calc && Number.isFinite(calc.phaseDeg)) ? `${Math.abs(calc.phaseDeg).toFixed(1)}°` : '—'
      return R.createElement('div',{className:'card'},[
        R.createElement('div',{className:'grid3'},[
          // header row
          R.createElement('div',{className:'head'}, sideLabel),
          R.createElement('div',{className:'head'}, '机器识别结果'),
          R.createElement('div',{className:'head'}, '从头计算结果'),
          // row: 幅值
          R.createElement('div',null, '幅值'),
          R.createElement('div',null, ampText),
          R.createElement('div',null, cAmpText),
          // row: 相位
          R.createElement('div',null, '相位'),
          R.createElement('div',null, phaseText),
          R.createElement('div',null, cPhaseText)
        ])
      ])
    }
    const items = []
    if(showR) items.push(makeCard('R'))
    if(showL) items.push(makeCard('L'))
    return R.createElement('div',{className:'two-col', style:{gridTemplateColumns: (showR && showL) ? '1fr 1fr' : '1fr'}}, items)
  }

  function DopsOpsRows(){
    const gid = currentGroup?.idx
    const g = opsMarks[gid] || emptyOpsMarks()
    const [hoverCell, setHoverCell] = useState(null) // {side, kind:'peak'|'valley', idx}
    const hoverTimerRef = useRef(null)
    function startHideTimer(){
      if(hoverTimerRef.current){ clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
      hoverTimerRef.current = setTimeout(()=>{ setHoverCell(null); hoverTimerRef.current = null }, 500)
    }
    function cancelHideTimer(){ if(hoverTimerRef.current){ clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null } }
    function isColComplete(side, idx){ const c=g[side]?.[idx]||{}; return c.peak && c.valley }
    function canActivateOp(side, idx){ return true }
    function activateOp(side, idx){ setOpsMode(prev=>({...prev, [side]: { op: idx, kind: prev[side].kind||null } })) }
    function armCell(side, kind, idx){ setOpsMode(prev=>({...prev, [side]: { op: idx, kind } })) }
    function clearCell(side, kind, i){
      if(!gid) return
      setOpsMarks(prev=>{
        const cur = prev[gid] || emptyOpsMarks()
        const arr = (cur[side]||emptyOpsMarkList()).map(c=>({...c}))
        const col = {...(arr[i]||{})}; delete col[kind==='peak'?'peak':'valley']; arr[i]=col
        return {...prev, [gid]: {...cur, [side]: arr} }
      })
      setOpsDataFrames(prev=>{
        const cur = prev[gid] || emptyOpsDataFrame()
        const sideDf = cur[side] || emptyOpsDataFrame()[side]
        const nextDf = { ...cur, [side]: { peak: sideDf.peak.slice(), trough: sideDf.trough.slice() } }
        if(kind==='peak') nextDf[side].peak[i] = 'NA'; else nextDf[side].trough[i] = 'NA'
        return { ...prev, [gid]: nextDf }
      })
      setHoverCell(null)
    }
    function reannotateCell(side, kind, i){
      clearCell(side, kind, i)
      setOpsMode(prev=>({ ...prev, [side]: { op: i, kind } }))
    }
    function clearSide(side){
      if(!gid) return
      setOpsMarks(prev=>{
        const cur = prev[gid] || emptyOpsMarks()
        const empty = emptyOpsMarkList()
        return { ...prev, [gid]: { ...cur, [side]: empty } }
      })
      setOpsManualSum(prev=>({ ...prev, [gid]: { ...(prev[gid]||{}), [side]: null } }))
      setOpsDataFrames(prev=>{
        const cur = prev[gid] || emptyOpsDataFrame()
        const ndf = { ...cur, [side]: emptyOpsDataFrame()[side] }
        return { ...prev, [gid]: ndf }
      })
      setOpsMode(prev=>({ ...prev, [side]: { op:null, kind:null } }))
    }
    // toggleOpsActive removed: buttons are always clickable; left chip shows side label
    function toggleKind(side, kind){ let op = opsMode[side].op; if(op==null){ op = 0 } setOpsMode(prev=>({...prev, [side]: { op, kind }})) }
    async function computeSide(side){
      for(let i=0;i<4;i++){ if(!isColComplete(side,i)){ await window.electronAPI.showWarning('Ops标注数据不完整，请标注完整后再尝试'); return } }
      const c5 = g[side]?.[4]||{}
      if((c5.peak && !c5.valley) || (!c5.peak && c5.valley)){ await window.electronAPI.showWarning('Ops标注数据不完整，请标注完整后再尝试'); return }
      let sp=0, sv=0
      for(let i=0;i<5;i++){ const c=g[side]?.[i]||{}; if(c.peak && c.valley){ sp += Number(c.peak.y)||0; sv += Number(c.valley.y)||0 } }
      const val = sp - sv
      setOpsManualSum(prev=>({...prev, [gid]: {...(prev[gid]||{}), [side]: val} }))
    }
    const fmtYNo=(y)=> y!=null? `${Number(y).toFixed(2)}`:'—'
    const fmtXNo=(x)=> x!=null? `${Number(x).toFixed(2)}`:'—'
    const makeGrid = (side)=>{
      const activeOp = opsMode[side].op
      const activeKind = opsMode[side].kind
      const active = true
      return R.createElement('div',{className:'card'},[
        R.createElement('div',{className:'ops-row'},[
          R.createElement('div',{className:'ops-grid'},[
            // Side label: frameless, same style as below labels
            R.createElement('div',{className:'label-sm'}, cnEye(side)),
            ...[0,1,2,3,4].map(i=> R.createElement('div',{key:side+'oplbl'+i, className:'label-sm'}, 'Op'+(i+1))),
            R.createElement('div',{className:'label-sm'}, '波峰'),
            ...[0,1,2,3,4].map(i=> {
              const val = (g[side]?.[i]||{}).peak?.y
              const armed = (activeKind==='peak' && activeOp===i)
              const text = armed? '标注' : ((val!=null)? fmtYNo(val) : '标注')
              const showOverlay = (!armed && val!=null && hoverCell && hoverCell.side===side && hoverCell.kind==='peak' && hoverCell.idx===i)
              return R.createElement('div',{
                key: side+'pwrap'+i,
                className:'ops-cell',
                onMouseEnter: ()=>{
                  const isAnchor = (!armed && val!=null)
                  if(isAnchor) cancelHideTimer()
                  if(isAnchor) setHoverCell({side, kind:'peak', idx:i})
                  // do not cancel timer when entering other cells
                },
                onMouseLeave: ()=>{ if(hoverCell && hoverCell.side===side && hoverCell.kind==='peak' && hoverCell.idx===i) startHideTimer() }
              }, [
                R.createElement('button',{
                  key: side+'pbtn'+i,
                  className:'btn btn-sm',
                  disabled: (!armed && val!=null),
                  style: armed? { color:'var(--primary)', borderColor:'var(--primary)' } : {},
                  onClick:()=>armCell(side,'peak', i),
                }, text),
                showOverlay && R.createElement('div',{key:side+'po'+i, className:'ops-hover', onMouseEnter:()=>cancelHideTimer(), onMouseLeave:()=>startHideTimer()},[
                  R.createElement('button',{key:'clr', className:'btn-mini', onClick:()=>clearCell(side,'peak',i)}, '清空'),
                  R.createElement('button',{key:'re', className:'btn-mini', onClick:()=>reannotateCell(side,'peak',i)}, '重标')
                ])
              ])
            }),
            R.createElement('div',{className:'label-sm'}, '波谷'),
            ...[0,1,2,3,4].map(i=> {
              const val = (g[side]?.[i]||{}).valley?.y
              const armed = (activeKind==='valley' && activeOp===i)
              const text = armed? '标注' : ((val!=null)? fmtYNo(val) : '标注')
              const showOverlay = (!armed && val!=null && hoverCell && hoverCell.side===side && hoverCell.kind==='valley' && hoverCell.idx===i)
              return R.createElement('div',{
                key: side+'vwrap'+i,
                className:'ops-cell',
                onMouseEnter: ()=>{
                  const isAnchor = (!armed && val!=null)
                  if(isAnchor) cancelHideTimer()
                  if(isAnchor) setHoverCell({side, kind:'valley', idx:i})
                  // do not cancel timer when entering other cells
                },
                onMouseLeave: ()=>{ if(hoverCell && hoverCell.side===side && hoverCell.kind==='valley' && hoverCell.idx===i) startHideTimer() }
              }, [
                R.createElement('button',{
                  key: side+'vbtn'+i,
                  className:'btn btn-sm',
                  disabled: (!armed && val!=null),
                  style: armed? { color:'var(--primary)', borderColor:'var(--primary)' } : {},
                  onClick:()=>armCell(side,'valley', i),
                }, text),
                showOverlay && R.createElement('div',{key:side+'vo'+i, className:'ops-hover', onMouseEnter:()=>cancelHideTimer(), onMouseLeave:()=>startHideTimer()},[
                  R.createElement('button',{key:'clr', className:'btn-mini', onClick:()=>clearCell(side,'valley',i)}, '清空'),
                  R.createElement('button',{key:'re', className:'btn-mini', onClick:()=>reannotateCell(side,'valley',i)}, '重标')
                ])
              ])
            })
          ]),
          R.createElement('div',{style:{display:'flex',flexDirection:'column',gap:8}},[
            R.createElement('button',{className:'btn btn-sm ops-compute', disabled:false, onClick:()=>computeSide(side)}, '计算'),
            R.createElement('button',{className:'btn btn-sm ops-compute', disabled:false, onClick:()=>clearSide(side)}, '清空')
          ])
        ])
      ])
    }
    const items=[]
    if(showR) items.push(makeGrid('R'))
    if(showL) items.push(makeGrid('L'))
    return R.createElement('div',{className:'two-col', style:{gridTemplateColumns: (showR&&showL)?'1fr 1fr':'1fr'}}, items)
  }

  // FVEP: show table rows N1/P1/N2/P2 for each eye
  function FVEPCombinedRows(){
    const labels = ['N1','P1','N2','P2']
    const makeCard = (side)=>{
      const sideLabel = cnEye(side)
      const mark = currentGroup?.[side]?.['标记'] || ''
      const parsed = parseFVEPMark(mark)
      const gridStyle = { display:'grid', gridTemplateColumns: `90px repeat(${labels.length}, 1fr)`, gap:6, fontSize:12, justifyItems:'center', textAlign:'center' }
      const gid = currentGroup?.idx
      const manual = (gid && fvepAnnotations[gid] && fvepAnnotations[gid][side]) || {}
      return R.createElement('div',{className:'card'},[
        R.createElement('div',{style:gridStyle},[
          // header row: topleft side label + column labels
          R.createElement('div',{className:'head'}, sideLabel),
          ...labels.map(lbl=> R.createElement('div',{key:side+'h'+lbl, className:'head'}, lbl)),
          // row: machine results
          R.createElement('div',null,'机器识别结果'),
          ...labels.map(lbl=>{
            const v = parsed[lbl]
            const txt = (v && v.t!=null && v.a!=null) ? `${v.t.toFixed(1)} ms, ${v.a.toFixed(1)} μv` : '—'
            return R.createElement('div',{key:side+'m'+lbl}, txt)
          }),
          // row: manual results placeholder
          R.createElement('div',null,'手动标注结果'),
          ...labels.map(lbl=>{
            const p = manual[lbl]
            const txt = (p && p.x!=null && p.y!=null) ? `${Number(p.x).toFixed(1)} ms, ${Number(p.y).toFixed(1)} μv` : '—'
            return R.createElement('div',{key:side+'u'+lbl}, txt)
          })
        ])
      ])
    }
    const items = []
    if(showR) items.push(makeCard('R'))
    if(showL) items.push(makeCard('L'))
    return R.createElement('div',{className:'two-col', style:{gridTemplateColumns: (showR && showL) ? '1fr 1fr' : '1fr'}}, items)
  }

  function AnnotateControls(){
    if(!enableAnnotate) return null
    const gid = currentGroup?.idx
    const vals = (gid && annotations[gid]) || {R:{},L:{}}
    function startB(side){
      const hasA = Boolean(vals[side]?.a)
      if(!hasA){ window.electronAPI?.showWarning && window.electronAPI.showWarning('请首先标注a波'); return }
      onAnnotateClick && onAnnotateClick(side,'b')
    }
    const makeCard = (side)=> R.createElement('div',{className:'card'},
      R.createElement('div',{className:'row', style:{justifyContent:'space-between'}},[
        R.createElement('button',{className:'btn', onClick:()=>onAnnotateClick && onAnnotateClick(side,'a')}, annotMode[side]==='a'?'正在标注a波':('标注'+cnEye(side)+'a波')),
        R.createElement('button',{className:'btn', onClick:()=>startB(side)}, annotMode[side]==='b'?'正在标注b波':('标注'+cnEye(side)+'b波'))
      ])
    )
    const items = []
    if(showR) items.push(makeCard('R'))
    if(showL) items.push(makeCard('L'))
    return R.createElement('div',{className:'two-col', style:{gridTemplateColumns: (showR && showL) ? '1fr 1fr' : '1fr'}}, items)
  }

  function FVEPAnnotateControls(){
    if(!isFVEP) return null
    return R.createElement('div',{className:'card'},[
      R.createElement('div',{className:'annot-ctrls', style:{gridTemplateColumns: (showR && showL) ? '1fr 1fr' : '1fr'}},[
        showR && R.createElement('div',null,
          R.createElement('div',{className:'row', style:{justifyContent:'space-between', flexWrap:'nowrap'}},[
            R.createElement('button',{className:'btn', onClick:()=>onAnnotateClick && onAnnotateClick('R','N1')}, annotMode.R==='N1'?'正在标注N1':'手动标注N1'),
            R.createElement('button',{className:'btn', onClick:()=>onAnnotateClick && onAnnotateClick('R','P1')}, annotMode.R==='P1'?'正在标注P1':'手动标注P1'),
            R.createElement('button',{className:'btn', onClick:()=>onAnnotateClick && onAnnotateClick('R','N2')}, annotMode.R==='N2'?'正在标注N2':'手动标注N2'),
            R.createElement('button',{className:'btn', onClick:()=>onAnnotateClick && onAnnotateClick('R','P2')}, annotMode.R==='P2'?'正在标注P2':'手动标注P2')
          ])
        ),
        showL && R.createElement('div',null,
          R.createElement('div',{className:'row', style:{justifyContent:'space-between', flexWrap:'nowrap'}},[
            R.createElement('button',{className:'btn', onClick:()=>onAnnotateClick && onAnnotateClick('L','N1')}, annotMode.L==='N1'?'正在标注N1':'手动标注N1'),
            R.createElement('button',{className:'btn', onClick:()=>onAnnotateClick && onAnnotateClick('L','P1')}, annotMode.L==='P1'?'正在标注P1':'手动标注P1'),
            R.createElement('button',{className:'btn', onClick:()=>onAnnotateClick && onAnnotateClick('L','N2')}, annotMode.L==='N2'?'开始标注N2':'手动标注N2'),
            R.createElement('button',{className:'btn', onClick:()=>onAnnotateClick && onAnnotateClick('L','P2')}, annotMode.L==='P2'?'开始标注P2':'手动标注P2')
          ])
        )
      ])
    ])
  }

  function BasicCard(){
    const baseName = filePath? filePath.split(/[\\\/]/).pop() : '-'
    return R.createElement('div',{className:'card'},[
      R.createElement('h3',{style:{textAlign:'center'}},'文件信息'),
      R.createElement(InfoKV,{rows:[
        ...(hasValid? [{k:'输入文件', v: baseName}] : []),
        {k:'检查项目', v: basicInfo.检查项目||'-'},
        {k:'医院', v: basicInfo.医院||'-'},
        {k:'病人', v: basicInfo.病人||'-'},
        {k:'检查日期', v: basicInfo.检查日期||'-'}
      ]})
    ])
  }

  return R.createElement('div',{className:'app'},[
    R.createElement('header',{key:'h'},
      R.createElement('div',{className:'hx'},[
        R.createElement('div',{className:'title'},[
          R.createElement('span',null,'ERG Viewer'),
          R.createElement('div',{className:'ecg', 'aria-hidden':true},
            R.createElement('svg',{viewBox:'0 0 60 16', width:60, height:16},
              R.createElement('path',{d:'M0 8 L8 8 L12 2 L16 14 L20 8 L28 8 L32 4 L36 12 L40 8 L60 8'})
            )
          )
        ]),
        R.createElement('div',{className:'actions'},[
          R.createElement('button',{className:'primary', onClick:()=>openFile()}, '加载数据'),
          R.createElement('button',{onClick:()=>{
            const rs = getComputedStyle(document.documentElement)
            const themeVars = {
              bg: rs.getPropertyValue('--bg').trim(),
              card: rs.getPropertyValue('--card-bg').trim(),
              fg: rs.getPropertyValue('--fg').trim(),
              muted: rs.getPropertyValue('--muted').trim(),
              accent: rs.getPropertyValue('--primary').trim()
            }
            window.electronAPI.openAbout(themeVars)
          }}, '关于'),
          R.createElement('button',{onClick:()=>setThemeOpen(true)}, '配色'),
          R.createElement('button',{onClick:()=>window.electronAPI.quitApp()}, '退出')
        ])
      ])
    ),
    // fixed-height sizing; no temporary mask overlay needed
    R.createElement('main',{key:'m'},[
      hasValid && R.createElement('div',{className:'left', key:'left'},[
        R.createElement(BasicCard,{key:'basic'}),
        R.createElement('div',{className:'card',key:'nav'},[
          (()=>{
            // 计算各组的显示名称（来源于绘图区标题，去除左右信息）
            function groupDisplayName(g){
              if(!g) return ''
              const prefer = (g.R && g.R['名字']) ? 'R' : 'L'
              const other = prefer==='R' ? 'L' : 'R'
              const nameWithSide = (function(){
                const n1 = buildFriendlyName(prefer, g)
                if(n1) return n1
                const n2 = buildFriendlyName(other, g)
                return n2 || ''
              })()
              // 去除 _R_ / _L_ 以及末尾的 _R / _L
              return nameWithSide.replace(/_R_/g,'_').replace(/_L_/g,'_').replace(/_R$/,'').replace(/_L$/,'')
            }
            const options = groups.map(g=> groupDisplayName(g))
            return R.createElement('div',{className:'group-nav', style:{display:'flex', alignItems:'stretch', gap:8}},[
              // 左：上一组（靠左，拉伸高度与中间区域一致）
              R.createElement('button',{ style:{alignSelf:'stretch'}, onClick:()=>{
                if(opsMode.R.kind||opsMode.L.kind){ setOpsMode(prev=>({ R:{ op: prev.R.op, kind:null }, L:{ op: prev.L.op, kind:null } })) }
                setCurrent(c=> (groups.length? ( (c-1+groups.length)%groups.length ) : 0))
              }}, '上一组'),
              // 中：标签 + 下拉（垂直排列，宽度一致）
              R.createElement('div',{style:{flex:1, display:'flex', flexDirection:'column', gap:6}},[
                R.createElement('span',{className:'chip', style:{width:'100%', textAlign:'center'}}, groups.length?`第 ${current+1} / ${groups.length} 组`:'—'),
                R.createElement('select',{
                  className:'select',
                  value: String(current),
                  onChange:e=>{
                    const idx = Number(e.target.value)
                    if(opsMode.R.kind||opsMode.L.kind){ setOpsMode(prev=>({ R:{ op: prev.R.op, kind:null }, L:{ op: prev.L.op, kind:null } })) }
                    setCurrent(Number.isFinite(idx)? idx : 0)
                  },
                  style:{ width:'100%', padding:'4px 8px', borderRadius:10, textAlign:'center', textAlignLast:'center' }
                }, options.map((name, i)=> R.createElement('option',{key:i, value:String(i)}, name || `第${i+1}组`)))
              ]),
              // 右：下一组（靠右，拉伸高度与中间区域一致）
              R.createElement('button',{ style:{alignSelf:'stretch'}, onClick:()=>{
                if(opsMode.R.kind||opsMode.L.kind){ setOpsMode(prev=>({ R:{ op: prev.R.op, kind:null }, L:{ op: prev.L.op, kind:null } })) }
                setCurrent(c=> (groups.length? ( (c+1)%groups.length ) : 0))
              }}, '下一组')
            ])
          })()
        ]),
        hasValid && R.createElement(GroupInfo,{g: currentGroup, key:'ginfo'})
      ]),
      R.createElement('div',{className:'center', key:'center'},[
        !hasValid && R.createElement('div',{key:'welcome-wrap', style:{flex:1, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100%'}},
          R.createElement('div',{style:{transform:'translateY(-6%)'}},
            R.createElement('div',{className:'card', key:'welcome', style:{textAlign:'center', minWidth:360}},[
              R.createElement('h3',{style:{margin:'0 0 10px', fontSize:20}},'欢迎使用ERG Viewer'),
              R.createElement('div',{className:'muted', style:{fontSize:14, lineHeight:1.7}},
                '请点击“加载数据”选择 OPTOPROBE 导出的 Excel 文件以开始分析。\n',
              ),
              R.createElement('div',{className:'muted', style:{fontSize:12, marginTop:6}},
                '小提示：加载成功后，可在绘图区进行坐标调整与标注；图像与数据均可导出。'
              )
            ])
          )
        ),
        hasValid && R.createElement('div',{className:'plots', key:'plots', style:{gridTemplateColumns: (showR && showL) ? '1fr 1fr' : '1fr'}},[
          showR && R.createElement(PlotPanel,{
            key:'R', title:'绘图', side:'R',
            group: {...currentGroup, __modeKey: modeKey, __persist: ((yRanges[modeKey]||{})[currentGroup?.idx]||{}) },
            onRangePersist: (range)=>{ setYRanges(prev=>{ const byMode = prev[modeKey] || {}; const gid = currentGroup?.idx; const byGroup = byMode[gid] || {}; const prevR = byGroup.R || {}; const has = (k)=> Object.prototype.hasOwnProperty.call(range||{}, k); const nextR = { ...prevR, ymin: has('ymin') ? range.ymin : (prevR.ymin ?? null), ymax: has('ymax') ? range.ymax : (prevR.ymax ?? null), xmin: has('xmin') ? range.xmin : (prevR.xmin ?? null), xmax: has('xmax') ? range.xmax : (prevR.xmax ?? null) }; const nextGroup = { ...byGroup, R: nextR }; return { ...prev, [modeKey]: { ...byMode, [gid]: nextGroup } } }) },
            enableAnnotate,
            activeAnnotate: (annotMode.R || (opsMode.R.kind? (opsMode.R.kind==='peak'?'opP':'opV') : null)),
            overlayText: (opsMode.R.kind ? (`开始标注${cnEye('R')}` + (opsMode.R.kind==='peak'?' 波峰':' 波谷') + (opsMode.R.op!=null? ` Op${opsMode.R.op+1}`:'')) : ''),
            onAnnotateClick:onAnnotateClick, onPointPicked:onPointPicked, onHoverPoint:onHoverPoint, onHoverEnd:onHoverEnd,
            marking: Boolean(opsMode.R.kind), suppressSpikes,
            onExportImage:exportImage, onExportData: exportData,
            disabled: annoting
          }),
          showL && R.createElement(PlotPanel,{
            key:'L', title:'绘图', side:'L',
            group: {...currentGroup, __modeKey: modeKey, __persist: ((yRanges[modeKey]||{})[currentGroup?.idx]||{}) },
            onRangePersist: (range)=>{ setYRanges(prev=>{ const byMode = prev[modeKey] || {}; const gid = currentGroup?.idx; const byGroup = byMode[gid] || {}; const prevL = byGroup.L || {}; const has = (k)=> Object.prototype.hasOwnProperty.call(range||{}, k); const nextL = { ...prevL, ymin: has('ymin') ? range.ymin : (prevL.ymin ?? null), ymax: has('ymax') ? range.ymax : (prevL.ymax ?? null), xmin: has('xmin') ? range.xmin : (prevL.xmin ?? null), xmax: has('xmax') ? range.xmax : (prevL.xmax ?? null) }; const nextGroup = { ...byGroup, L: nextL }; return { ...prev, [modeKey]: { ...byMode, [gid]: nextGroup } } }) },
            enableAnnotate,
            activeAnnotate: (annotMode.L || (opsMode.L.kind? (opsMode.L.kind==='peak'?'opP':'opV') : null)),
            overlayText: (opsMode.L.kind ? (`开始标注${cnEye('L')}` + (opsMode.L.kind==='peak'?' 波峰':' 波谷') + (opsMode.L.op!=null? ` Op${opsMode.L.op+1}`:'')) : ''),
            onAnnotateClick:onAnnotateClick, onPointPicked:onPointPicked, onHoverPoint:onHoverPoint, onHoverEnd:onHoverEnd,
            marking: Boolean(opsMode.L.kind), suppressSpikes,
            onExportImage:exportImage, onExportData: exportData,
            disabled: annoting
          })
        ]),
        hasValid && (annotMode.R || annotMode.L || opsMode.R.kind || opsMode.L.kind) && R.createElement(Magnifier,{key:'magnifier'}),
        hasValid && (
          isDops ? R.createElement(DopsCombinedRows,{key:'dops-comb'})
          : (isFlicker ? R.createElement(FlickerCombinedRows,{key:'flicker-comb'})
            : (isFVEP ? R.createElement(FVEPCombinedRows,{key:'fvep-comb'})
              : (enableAnnotate ? R.createElement(CombinedEyeRows,{key:'comb'})
                : (currentGroup && R.createElement(MarkCardsRow,{key:'marks-row'}))
              )
            )
          )
        ),
        hasValid && isDops && R.createElement(DopsOpsRows,{key:'dops-ops'}),
        hasValid && isFVEP && R.createElement(FVEPAnnotateControls,{key:'fvep-annot'}),
        hasValid && !isDops && !isFVEP && enableAnnotate && R.createElement(AnnotateControls,{key:'annot-controls'})
      ])
    ]),
    R.createElement(ThemeModal,{key:'theme'})
  ])
}

try{
  const rootEl = document.getElementById('root')
  if(RD.createRoot){
    RD.createRoot(rootEl).render(R.createElement(App))
  }else{
    RD.render(R.createElement(App), rootEl)
  }
  console.log('Renderer: app mounted')
}catch(e){
  console.error('Mount error', e)
  const el = document.createElement('pre')
  el.style.padding='16px'
  el.textContent = '界面挂载失败: '+e.message
  document.body.appendChild(el)
}
