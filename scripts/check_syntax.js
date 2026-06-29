#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const repoRoot = path.join(__dirname, '..')
const roots = ['src-v2', 'scripts']
const ignoredDirs = new Set(['node_modules', 'dist', 'coverage', 'docs', '.git'])

function main() {
  const files = roots
    .flatMap((root) => listJsFiles(path.join(repoRoot, root)))
    .sort((a, b) => a.localeCompare(b))

  files.forEach((file) => {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      process.stdout.write(result.stdout || '')
      process.stderr.write(result.stderr || '')
      process.exit(result.status || 1)
    }
  })

  console.log(`syntax-check: ok | files=${files.length}`)
}

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) return []
      return listJsFiles(fullPath)
    }
    if (!entry.isFile()) return []
    return /\.(js|mjs|cjs)$/.test(entry.name) ? [fullPath] : []
  })
}

main()
