#!/usr/bin/env node
const fs = require('fs')
const XLSX = require('xlsx')
const projectCore = require('../src-v2/renderer/core/project')
const exporter = require('../src-v2/renderer/core/export')

function main() {
  const files = process.argv.slice(2)
  if (!files.length) {
    console.error('Usage: node scripts/smoke_parse.js <OPTOPROBE-export.xlsx> [...more files]')
    process.exit(1)
  }
  files.forEach((file) => {
    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`)
      process.exit(1)
    }
  })

  const samples = files.flatMap((file) => {
    const workbook = XLSX.readFile(file)
    return projectCore.parseWorkbookToSamples(workbook, file)
  })
  const project = projectCore.normalizeProject({
    title: files.length === 1 ? files[0] : 'Smoke parse batch',
    samples,
    sources: projectCore.deriveSources(samples),
  })
  const workbookSheets = exporter.buildProjectWorkbookSheets(project)
  const modes = Array.from(new Set(project.samples.map((sample) => sample.mode))).sort()
  const subjects = Array.from(new Set(project.samples.map((sample) => sample.subjectId))).sort()

  console.log(`Files: ${files.length}`)
  console.log(`Records: ${project.samples.length}`)
  console.log(`Subjects: ${subjects.length} (${subjects.slice(0, 8).join(', ')})`)
  console.log(`Modes: ${modes.join(', ') || 'none'}`)
  console.log(`Sources: ${project.sources.length}`)
  console.log(`Raw metric rows: ${Math.max(0, workbookSheets.metrics_raw.length - 1)}`)
  console.log(`Manual metric rows: ${Math.max(0, workbookSheets.metrics_manual.length - 1)}`)
  console.log(`Correction log rows: ${Math.max(0, workbookSheets.corrections_log.length - 1)}`)

  project.samples.slice(0, 5).forEach((sample) => {
    const right = sample.traces && sample.traces.right ? sample.traces.right.y.length : 0
    const left = sample.traces && sample.traces.left ? sample.traces.left.y.length : 0
    const raw = sample.metrics && sample.metrics.raw ? sample.metrics.raw : {}
    console.log(
      [
        sample.subjectId,
        sample.mode,
        sample.acquisitionId,
        sample.condition,
        `R=${right}`,
        `L=${left}`,
        `amp=${format(raw.amplitudeUv)}`,
      ].join(' | ')
    )
  })
}

function format(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : 'NA'
}

main()
