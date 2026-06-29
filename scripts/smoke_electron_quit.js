#!/usr/bin/env node
const path = require('path')
const { spawn } = require('child_process')

const electron = require('electron')

async function main() {
  const repoRoot = path.join(__dirname, '..')
  const toolbar = await runElectronQuit(repoRoot, 'toolbar')
  assert(toolbar.clicked, 'Quit smoke did not observe the renderer clicking the Quit button.')
  assert(toolbar.code === 0, `Electron toolbar quit smoke exited with ${toolbar.code}`)
  console.log('electron-quit-smoke: ok | toolbar=clicked | exit=0')
}

function runElectronQuit(repoRoot, target) {
  return new Promise((resolve, reject) => {
    const child = spawn(electron, [repoRoot], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ERG_VIEWER_QA_QUIT: '1',
        ERG_VIEWER_QA_QUIT_TARGET: target,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Electron quit smoke timed out\n${stdout}\n${stderr}`))
    }, 20000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timeout)
      const expected = '[qa-quit-smoke] clicking Quit'
      const clicked = stdout.includes(expected)
      if (code === 0) resolve({ code, clicked, stdout, stderr })
      else reject(new Error(`Electron exited with ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error))
  process.exit(1)
})
