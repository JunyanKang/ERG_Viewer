#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const cssPath = path.join(__dirname, '..', 'src-v2', 'renderer', 'styles.css')
const appPath = path.join(__dirname, '..', 'src-v2', 'renderer', 'app.js')
const css = fs.readFileSync(cssPath, 'utf8')
const appSource = fs.readFileSync(appPath, 'utf8')

const rules = new Map()
const rulePattern = /([^{}]+)\{([^{}]*)\}/g
let match
while ((match = rulePattern.exec(css))) {
  const selector = normalizeSelector(match[1])
  const body = parseBody(match[2])
  if (!rules.has(selector)) rules.set(selector, [])
  rules.get(selector).push(body)
}

const root = mergedRule(':root')
const failures = []

expectTextTokens(root)
expectFontSizeDeclarations()
expectColorDeclarations()
expectRadiusDeclarations()
expectMaterialTokens(root)
expectMaterialDeclarations()
expectPanelHeaderMarkup()

expectDeclaration(root, '--control-height', '30px', ':root')
expectDeclaration(root, '--radius', '8px', ':root')
expectDeclaration(root, '--radius-none', '0', ':root')
expectDeclaration(root, '--radius-sm', '6px', ':root')
expectDeclaration(root, '--radius-inner', '7px', ':root')
expectDeclaration(root, '--radius-round', '999px', ':root')
expectDeclaration(root, '--radius-circle', '50%', ':root')
expectDeclaration(root, '--control-radius', 'var(--radius)', ':root')
expectDeclaration(root, '--control-font-size', 'var(--text-body)', ':root')
expectDeclaration(root, '--control-font-weight', 'var(--weight-meta)', ':root')
expectDeclaration(root, '--chip-height', 'var(--control-height)', ':root')
expectDeclaration(root, '--panel-header-height', '38px', ':root')

expectControl('button', {
  height: 'var(--control-height)',
  'border-radius': 'var(--control-radius)',
  'font-size': 'var(--control-font-size)',
  'font-weight': 'var(--control-font-weight)',
  background: 'var(--material-control)',
  'backdrop-filter': 'var(--material-backdrop)',
})

expectControl('select,input', {
  height: 'var(--control-height)',
  'border-radius': 'var(--control-radius)',
  'font-size': 'var(--control-font-size)',
  background: 'var(--material-control)',
  'backdrop-filter': 'var(--material-backdrop)',
})

expectControl('.panel-header button', {
  'border-radius': 'var(--control-radius)',
  'font-size': 'var(--control-font-size)',
  'font-weight': 'var(--control-font-weight)',
})

expectControl('.panel-header', {
  'min-height': 'var(--panel-header-height)',
  overflow: 'hidden',
  background: 'var(--material-panel-muted)',
  'backdrop-filter': 'var(--material-backdrop)',
})

expectControl('.panel-header > :last-child', {
  flex: '0 0 auto',
})

expectControl('.source-count,.record-count', {
  height: 'var(--chip-height)',
  'border-radius': 'var(--control-radius)',
})

expectControl('.source-count,.record-count,.source-badge', {
  'font-size': 'var(--control-font-size)',
  'font-weight': 'var(--control-font-weight)',
})

expectControl('.source-badge', {
  height: 'var(--chip-height)',
  'border-radius': 'var(--control-radius)',
})

expectControl('.panel-action', {
  height: 'var(--control-height)',
  'border-radius': 'var(--control-radius)',
  'font-size': 'var(--control-font-size)',
  'font-weight': 'var(--control-font-weight)',
  background: 'var(--material-control)',
  'backdrop-filter': 'var(--material-backdrop)',
})

expectControl('.topbar', {
  background: 'var(--material-toolbar)',
  'backdrop-filter': 'var(--material-backdrop)',
})

expectControl('.tabs', {
  background: 'var(--material-chip)',
  'backdrop-filter': 'var(--material-backdrop)',
})

expectControl('.panel', {
  background: 'var(--material-panel)',
  'backdrop-filter': 'var(--material-backdrop)',
})

expectControl('.panel-title', {
  'min-width': '0',
  overflow: 'hidden',
  'text-overflow': 'ellipsis',
  'font-size': 'var(--text-body)',
  'font-weight': 'var(--weight-title)',
  'white-space': 'nowrap',
})

expectControl('.filter-chip', {
  'border-radius': 'var(--control-radius)',
  'font-size': 'var(--control-font-size)',
  'font-weight': 'var(--control-font-weight)',
})

expectControl('.pill', {
  height: 'var(--chip-height)',
  'border-radius': 'var(--control-radius)',
  'font-size': 'var(--control-font-size)',
  'font-weight': 'var(--control-font-weight)',
})

expectControl('.assumption-chip', {
  'min-height': 'var(--control-height)',
  'border-radius': 'var(--control-radius)',
})

expectControl('.assumption-chip strong', {
  'font-size': 'var(--control-font-size)',
  'font-weight': 'var(--control-font-weight)',
})

expectControl('.export-actions.compact button', {
  height: 'var(--control-height)',
})

expectControl('.report-scope-options button', {
  height: 'var(--control-height)',
  'border-radius': 'var(--control-radius)',
  'font-size': 'var(--control-font-size)',
  'font-weight': 'var(--control-font-weight)',
})

expectControl('.manual-buttons button', {
  height: 'var(--control-height)',
  'font-size': 'var(--control-font-size)',
})

expectControl('.manual-actions button', {
  height: 'var(--control-height)',
  'font-size': 'var(--control-font-size)',
})

expectControl('.sheet-chip', {
  height: 'var(--chip-height)',
  'border-radius': 'var(--control-radius)',
  'font-size': 'var(--control-font-size)',
  'font-weight': 'var(--control-font-weight)',
})

if (failures.length) {
  console.error('Control style audit failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Control style audit passed')

function expectTextTokens(rootBody) {
  const expectedTextTokens = new Map([
    ['--text-label', '10px'],
    ['--text-meta', '11px'],
    ['--text-body', '12px'],
    ['--text-value', '16px'],
  ])
  const actualTextTokens = Object.keys(rootBody || {}).filter((name) => name.startsWith('--text-'))
  if (actualTextTokens.length !== expectedTextTokens.size) {
    failures.push(
      `:root expected ${expectedTextTokens.size} text tokens, got ${actualTextTokens.length}: ${actualTextTokens.join(', ')}`
    )
  }
  expectedTextTokens.forEach((value, name) => expectDeclaration(rootBody, name, value, ':root'))
  actualTextTokens
    .filter((name) => !expectedTextTokens.has(name))
    .forEach((name) => failures.push(`:root unexpected text token ${name}`))
}

function expectFontSizeDeclarations() {
  const allowed = new Set([
    'var(--control-font-size)',
    'var(--text-label)',
    'var(--text-meta)',
    'var(--text-body)',
    'var(--text-value)',
  ])
  for (const [selector, bodies] of rules.entries()) {
    bodies.forEach((body) => {
      if (!body['font-size']) return
      if (!allowed.has(body['font-size'])) {
        failures.push(`${selector} uses non-token font-size ${body['font-size']}`)
      }
    })
  }
}

function expectColorDeclarations() {
  const rawColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(/
  for (const [selector, bodies] of rules.entries()) {
    if (selector === ':root') continue
    bodies.forEach((body) => {
      Object.entries(body).forEach(([name, value]) => {
        if (rawColorPattern.test(value)) {
          failures.push(`${selector} uses non-token color in ${name}: ${value}`)
        }
      })
    })
  }
}

function expectRadiusDeclarations() {
  const allowed = new Set([
    'var(--control-radius)',
    'var(--radius)',
    'var(--radius-none)',
    'var(--radius-sm)',
    'var(--radius-inner)',
    'var(--radius-round)',
    'var(--radius-circle)',
  ])
  for (const [selector, bodies] of rules.entries()) {
    bodies.forEach((body) => {
      if (!body['border-radius']) return
      if (!allowed.has(body['border-radius'])) {
        failures.push(`${selector} uses non-token border-radius ${body['border-radius']}`)
      }
    })
  }
}

function expectMaterialTokens(rootBody) {
  ;[
    '--material-window',
    '--material-toolbar',
    '--material-panel',
    '--material-panel-muted',
    '--material-control',
    '--material-control-hover',
    '--material-control-disabled',
    '--material-chip',
    '--material-chip-active',
    '--material-border',
    '--material-backdrop',
    '--material-shadow-panel',
    '--material-shadow-control',
    '--material-shadow-inset',
  ].forEach((name) => {
    if (!rootBody[name]) failures.push(`:root missing global material token ${name}`)
  })
}

function expectMaterialDeclarations() {
  const rawGlassPattern = /\bblur\(|\bsaturate\(/
  for (const [selector, bodies] of rules.entries()) {
    if (selector === ':root') continue
    bodies.forEach((body) => {
      Object.entries(body).forEach(([name, value]) => {
        if (name.includes('backdrop-filter') && rawGlassPattern.test(value)) {
          failures.push(`${selector} uses local glass filter ${name}: ${value}`)
        }
      })
    })
  }
}

function expectPanelHeaderMarkup() {
  const headerCount = (appSource.match(/className:\s*'panel-header'/g) || []).length
  if (!headerCount) {
    failures.push('app.js has no panel-header markup')
    return
  }

  const allowedHeaderClasses = new Set([
    'panel-title',
    'pill',
    'source-count',
    'record-count',
    'panel-action',
    'primary',
  ])

  const headers = [...appSource.matchAll(/className:\s*'panel-header'/g)].map((headerMatch) =>
    extractCallBlock(appSource, headerMatch.index)
  )

  headers.forEach((block, index) => {
    if (!block) {
      failures.push(`panel-header #${index + 1} could not be parsed as a local e(...) block`)
      return
    }
    if (!/className:\s*'[^']*\bpanel-title\b[^']*'/.test(block)) {
      failures.push(`panel-header #${index + 1} is missing panel-title`)
    }

    extractClassNames(block)
      .filter((className) => !className.startsWith('panel-body'))
      .filter((className) => className !== 'panel-header')
      .forEach((className) => {
        const baseClass = className.split(/\s+/)[0]
        if (!allowedHeaderClasses.has(baseClass)) {
          failures.push(`panel-header #${index + 1} uses non-standard header control class ${className}`)
        }
      })
  })
}

function extractClassNames(source) {
  const values = []
  const literalPattern = /className:\s*'([^']+)'/g
  const templatePattern = /className:\s*`([^`]+)`/g
  const ternaryPattern = /className:(?!\s*`)\s*[^,\n}]*\?\s*'([^']+)'\s*:\s*'([^']+)'/g
  let classMatch
  while ((classMatch = literalPattern.exec(source))) values.push(classMatch[1])
  while ((classMatch = templatePattern.exec(source))) values.push(classMatch[1].replace(/\$\{[^}]*\}/g, '').trim())
  while ((classMatch = ternaryPattern.exec(source))) {
    values.push(classMatch[1])
    values.push(classMatch[2])
  }
  return values.filter(Boolean)
}

function extractCallBlock(source, innerIndex) {
  const callStart = source.lastIndexOf('e(', innerIndex)
  if (callStart === -1) return ''
  const closeIndex = findMatchingParen(source, callStart + 1)
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

function normalizeSelector(selector) {
  return selector
    .split(',')
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .join(',')
}

function parseBody(body) {
  const declarations = {}
  body
    .split(';')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const index = line.indexOf(':')
      if (index === -1) return
      declarations[line.slice(0, index).trim()] = line.slice(index + 1).trim()
    })
  return declarations
}

function mergedRule(selector) {
  const bodies = rules.get(selector)
  if (!bodies || !bodies.length) return null
  return Object.assign({}, ...bodies)
}

function expectControl(selector, expected) {
  const body = mergedRule(selector)
  if (!body) {
    failures.push(`${selector} rule is missing`)
    return
  }
  Object.entries(expected).forEach(([name, value]) => expectDeclaration(body, name, value, selector))
}

function expectDeclaration(body, name, value, selector) {
  if (!body) {
    failures.push(`${selector} rule is missing`)
    return
  }
  if (body[name] !== value) {
    failures.push(`${selector} expected ${name}: ${value}, got ${body[name] || 'missing'}`)
  }
}
