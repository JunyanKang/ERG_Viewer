#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const appPath = path.join(__dirname, '..', 'src-v2', 'renderer', 'app.js')
const appSource = fs.readFileSync(appPath, 'utf8')
const failures = []

expectIntrinsicControls()
expectComponentControls()
expectStageDependencyContracts()

if (failures.length) {
  console.error('Interaction audit failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Interaction audit passed')

function expectIntrinsicControls() {
  expectElements('button', (block, index) => {
    if (!block.includes('onClick:')) failures.push(`button #${index + 1} is missing onClick`)
    if (block.includes('disabled:') && !block.includes('title:') && !block.includes("'aria-label':")) {
      failures.push(`disabled button #${index + 1} is missing title or aria-label`)
    }
  })

  expectElements('select', (block, index) => {
    if (!block.includes('value:')) failures.push(`select #${index + 1} is missing controlled value`)
    if (!block.includes('onChange:')) failures.push(`select #${index + 1} is missing onChange`)
  })

  expectElements('input', (block, index) => {
    if (!block.includes('value:')) failures.push(`input #${index + 1} is missing controlled value`)
    if (!block.includes('onChange:') && !block.includes('readOnly: true')) {
      failures.push(`input #${index + 1} is neither editable nor readOnly`)
    }
  })
}

function expectComponentControls() {
  const components = ['InlineSelect', 'EditableField']
  components.forEach((component) => {
    const calls = [...appSource.matchAll(new RegExp(`e\\(\\s*${component}\\b`, 'g'))]
    if (!calls.length) failures.push(`${component} has no call sites`)
    calls.forEach((call, index) => {
      const block = extractCallBlock(appSource, call.index)
      if (!block) {
        failures.push(`${component} #${index + 1} could not be parsed`)
        return
      }
      if (!block.includes('onChange:')) failures.push(`${component} #${index + 1} is missing onChange`)
    })
  })
}

function expectStageDependencyContracts() {
  expectSourceContains('const canExportWorkbook', 'Topbar workbook export prerequisite is missing')
  expectSourceContains('const canExportPdf', 'Report PDF prerequisite is missing')
  expectSourceContains('disabled: !canExportPdf', 'Export PDF button is not gated by report source rows')
  expectSourceContains('const canCopySourceRows', 'Report Copy CSV prerequisite is missing')
  expectSourceContains('disabled: !canCopySourceRows', 'Copy CSV button is not gated by report source rows')
  expectSourceContains('const disabled = !scope || !scope.records', 'Report scope buttons are not gated by matching records')
  expectSourceContains("onClick: () => !disabled && onReportScope && onReportScope(id)", 'Report scope click handler does not respect disabled state')
}

function expectSourceContains(needle, message) {
  if (!appSource.includes(needle)) failures.push(message)
}

function expectElements(tag, inspect) {
  const pattern = new RegExp(`e\\(\\s*['"]${tag}['"]`, 'g')
  const calls = [...appSource.matchAll(pattern)]
  if (!calls.length) failures.push(`No ${tag} controls found`)
  calls.forEach((call, index) => {
    const block = extractCallBlock(appSource, call.index)
    if (!block) {
      failures.push(`${tag} #${index + 1} could not be parsed`)
      return
    }
    inspect(block, index)
  })
}

function extractCallBlock(source, callStart) {
  const openParenIndex = source.indexOf('(', callStart)
  if (openParenIndex === -1) return ''
  const closeIndex = findMatchingParen(source, openParenIndex)
  return closeIndex === -1 ? '' : source.slice(callStart, closeIndex + 1)
}

function findMatchingParen(source, openParenIndex) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let index = openParenIndex; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}
