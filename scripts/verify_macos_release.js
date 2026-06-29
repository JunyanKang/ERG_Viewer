#!/usr/bin/env node
const path = require('path')
const { spawnSync } = require('child_process')

const repoRoot = path.join(__dirname, '..')
const installedApp = '/Applications/ERG Viewer.app'
const installedExecutable = path.join(installedApp, 'Contents', 'MacOS', 'ERG Viewer')

const steps = [
  ['npm', ['run', 'smoke:electron-state'], 'development Electron page state gates'],
  ['npm', ['run', 'smoke:electron-export'], 'development Electron export gate'],
  ['npm', ['run', 'smoke:electron-layout'], 'development Electron layout gate'],
  ['npm', ['run', 'smoke:electron-design-audit'], 'development Electron design gate'],
  ['npm', ['run', 'smoke:electron-interactions'], 'development Electron interaction coverage gate'],
  ['npm', ['run', 'smoke:control-interaction-ledger'], 'development and installed control interaction ledger gate'],
  ['npm', ['run', 'smoke:electron-role-review'], 'development Electron role-review gate'],
  ['npm', ['run', 'smoke:electron-project-roundtrip'], 'development Electron project roundtrip gate'],
  ['npm', ['run', 'smoke:electron-quit'], 'development Electron quit gate'],
  ['npm', ['run', 'build:mac'], 'macOS DMG/ZIP build'],
  ['ditto', [path.join(repoRoot, 'dist', 'mac-arm64', 'ERG Viewer.app'), installedApp], 'install app bundle into /Applications'],
  ['npm', ['run', 'smoke:mac-release-artifacts'], 'macOS release artifact metadata gate'],
  ['npm', ['run', 'smoke:installed-app-ui'], 'installed app UI/layout/design/interaction gate'],
  ['npm', ['run', 'smoke:installed-visual-design-matrix'], 'installed app visual design matrix gate'],
  ['npm', ['run', 'smoke:installed-input-mode-matrix'], 'installed app input mode matrix gate'],
  ['npm', ['run', 'smoke:installed-control-response-matrix'], 'installed app control response matrix gate'],
  ['npm', ['run', 'smoke:installed-ui-spec-matrix'], 'installed app UI specification matrix gate'],
  ['npm', ['run', 'smoke:installed-app-roundtrip'], 'installed app import/export/project roundtrip gate'],
  [installedExecutable, [], 'installed app toolbar quit gate', { ERG_VIEWER_QA_QUIT: '1' }],
  [
    installedExecutable,
    [],
    'installed app red-window quit gate',
    { ERG_VIEWER_QA_QUIT: '1', ERG_VIEWER_QA_QUIT_TARGET: 'window-red' },
  ],
  ['npm', ['run', 'check'], 'full source plus installed-app delivery gate after installation'],
]

function main() {
  const startedAt = Date.now()
  const completed = []
  for (const [command, args, label, extraEnv] of steps) {
    const stepStartedAt = Date.now()
    console.log(`\n[release-verify] ${label}`)
    console.log(`[release-verify] $ ${[command].concat(args).map(shellQuote).join(' ')}`)
    const result = spawnSync(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...(extraEnv || {}) },
      stdio: 'inherit',
    })
    if (result.error) {
      throw result.error
    }
    if (result.status !== 0) {
      throw new Error(`${label} failed with exit code ${result.status}`)
    }
    completed.push({ label, seconds: ((Date.now() - stepStartedAt) / 1000).toFixed(1) })
  }
  console.log(
    [
      '\nmacos-release-verify: ok',
      `steps=${completed.length}`,
      `seconds=${((Date.now() - startedAt) / 1000).toFixed(1)}`,
      `installed=${installedApp}`,
    ].join(' | ')
  )
}

function shellQuote(value) {
  const text = String(value || '')
  return /^[A-Za-z0-9_./:=+-]+$/.test(text) ? text : JSON.stringify(text)
}

main()
