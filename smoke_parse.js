// Headless smoke test: parse ERG Excel and summarize groups
const fs = require('fs')
const XLSX = require('xlsx')

function sanitizeText(v){
  if(!v) return ''
  return String(v).replace(/\r?\n/g,' ').replace(/u/g,'μ').trim()
}
function sanitizeMark(v){
  const s = sanitizeText(v)
  if(!s) return ''
  return s.endsWith('v') ? s : s + 'v'
}

function parse(file){
  const buf = fs.readFileSync(file)
  const wb = XLSX.read(buf, {type:'buffer'})
  const sh = wb.Sheets[wb.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json(sh, {header:1, raw:false})
  const rows = json.map(r=>({Item:r[0]||'', Param:(r[1]||'').toString(), Value:(r[2]||'').toString()})).filter(r=>r.Item||r.Param||r.Value)

  const basicMap = new Map(rows.map(r=>[r.Param, r.Value]))
  const basic = {
    item: sanitizeText(basicMap.get('检查项目')|| basicMap.get('Item') || ''),
    hospital: sanitizeText(basicMap.get('[医院_医院名字]')||''),
    patient: sanitizeText(basicMap.get("'[病人_姓名]") || basicMap.get('[病人_姓名]') || ''),
    date: sanitizeText(basicMap.get('[检查_检查日期]')||'')
  }

  const groups = {}
  const re = /^([rl])_(0?\d+)_(.+)$/i
  rows.forEach(r=>{
    const param = (r.Param||'').replace(/^\[/,'').replace(/\]$/,'')
    const m = re.exec(param)
    if(m){
      const side = m[1]
      const idx = Number(m[2])
      const suffix = m[3]
      if(!groups[idx]) groups[idx] = {idx, R:{}, L:{}}
      const val = suffix==='标记' ? sanitizeMark(r.Value) : sanitizeText(r.Value)
      groups[idx][side][suffix] = val
    }
  })
  const list = Object.values(groups).sort((a,b)=>a.idx-b.idx)
  return { basic, list }
}

function parseY(str){
  if(!str) return []
  const parts = String(str).replace(/\r?\n/g,' ').split(/[,;\s]+/).filter(Boolean)
  return parts.map(Number).filter(v=>!Number.isNaN(v))
}

function buildX(totalMs, n){
  const step = Number(totalMs)/Number(n)
  return Array.from({length:n}, (_,i)=> Number((i*step).toFixed(3)))
}

function main(){
  const file = process.argv[2]
  if(!file){
    console.error('Usage: node smoke_parse.js <OPTOPROBE-export.xlsx>')
    process.exit(1)
  }
  if(!fs.existsSync(file)){
    console.error(`File not found: ${file}`)
    process.exit(1)
  }
  const {basic, list} = parse(file)
  console.log('Basic:', basic)
  console.log('Groups:', list.length)
  list.slice(0,3).forEach(g=>{
    const nameR = g.R['名字']||''
    const nameL = g.L['名字']||''
    const yR = parseY(g.R['详细数据(uv)'])
    const yL = parseY(g.L['详细数据(uv)'])
    const tR = Number((g.R['分析时间']||'').toString().replace(/[^\d.]/g,'')) || 0
    const tL = Number((g.L['分析时间']||'').toString().replace(/[^\d.]/g,'')) || 0
    const xR = yR.length? buildX(tR, yR.length) : []
    const xL = yL.length? buildX(tL, yL.length) : []
    console.log(`Group ${g.idx}: R(${nameR}) points=${yR.length} time=${tR}ms, L(${nameL}) points=${yL.length} time=${tL}ms`)
    if(yR.length) console.log('  R first 5:', xR.slice(0,5).map((v,i)=>[v,yR[i]]))
    if(yL.length) console.log('  L first 5:', xL.slice(0,5).map((v,i)=>[v,yL[i]]))
  })
}

main()
