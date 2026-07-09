#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const INSTALLED_APP = '/Applications/OptoERGViewer.app'

function main() {
  const repoRoot = path.join(__dirname, '..')
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const version = String(packageJson.version || '').trim()
  const appId = String(packageJson.build && packageJson.build.appId ? packageJson.build.appId : '').trim()
  const productName = String(packageJson.build && packageJson.build.productName ? packageJson.build.productName : 'OptoERGViewer')
  assert(version, 'package.json version is missing')
  assert(appId, 'package.json build.appId is missing')

  const arch = process.env.ERG_VIEWER_RELEASE_ARCH || process.arch
  assert(['arm64', 'x64'].includes(arch), `Unsupported release arch: ${arch}`)

  const distDir = path.join(repoRoot, 'dist')
  const appBundle = path.join(distDir, `mac-${arch}`, `${productName}.app`)
  const dmgPath = path.join(distDir, `${productName}-${version}-mac-${arch}.dmg`)
  const zipPath = path.join(distDir, `${productName}-${version}-mac-${arch}.zip`)
  const dmgBlockmap = `${dmgPath}.blockmap`
  const zipBlockmap = `${zipPath}.blockmap`

  ;[appBundle, dmgPath, zipPath, dmgBlockmap, zipBlockmap, INSTALLED_APP].forEach((filePath) =>
    assertPathExists(filePath)
  )
  assertFileSize(dmgPath, 10 * 1024 * 1024)
  assertFileSize(zipPath, 10 * 1024 * 1024)
  assertFileSize(dmgBlockmap, 100)
  assertFileSize(zipBlockmap, 100)

  assertAppBundle(appBundle, version, appId, productName)
  assertAppBundle(INSTALLED_APP, version, appId, productName)

  const distSigning = signingStatus(appBundle)
  const installedSigning = signingStatus(INSTALLED_APP)
  assert(distSigning.status !== 'missing', `Could not inspect signing for ${appBundle}`)
  assert(installedSigning.status !== 'missing', `Could not inspect signing for ${INSTALLED_APP}`)

  console.log(
    [
      'macos-release-artifacts-smoke: ok',
      `version=${version}`,
      `arch=${arch}`,
      `dmg=${path.basename(dmgPath)}`,
      `zip=${path.basename(zipPath)}`,
      `distSigning=${distSigning.status}`,
      `installedSigning=${installedSigning.status}`,
    ].join(' | ')
  )
}

function assertAppBundle(appPath, version, appId, productName) {
  const executablePath = path.join(appPath, 'Contents', 'MacOS', productName)
  assertPathExists(executablePath)
  const infoPath = path.join(appPath, 'Contents', 'Info.plist')
  const shortVersion = plistRead(infoPath, 'CFBundleShortVersionString')
  const bundleId = plistRead(infoPath, 'CFBundleIdentifier')
  const bundleName = plistRead(infoPath, 'CFBundleName')
  assert(shortVersion === version, `${appPath} version mismatch: ${shortVersion} != ${version}`)
  assert(bundleId === appId, `${appPath} bundle id mismatch: ${bundleId} != ${appId}`)
  assert(bundleName === productName, `${appPath} bundle name mismatch: ${bundleName} != ${productName}`)
}

function signingStatus(appPath) {
  const result = spawnSync('codesign', ['-dv', '--verbose=4', appPath], { encoding: 'utf8' })
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  if (/Signature=adhoc/.test(output) || /flags=.*adhoc/.test(output)) return { status: 'adhoc' }
  const authority = output.match(/Authority=(.+)/)
  if (authority) return { status: 'signed', authority: authority[1].trim() }
  if (/code object is not signed/.test(output)) return { status: 'unsigned' }
  return { status: result.status === 0 ? 'signed' : 'missing', output: output.trim() }
}

function plistRead(infoPath, key) {
  const result = spawnSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, infoPath], { encoding: 'utf8' })
  assert(result.status === 0, `plist read failed for ${infoPath} ${key}: ${result.stderr || result.stdout}`)
  return String(result.stdout || '').trim()
}

function assertPathExists(filePath) {
  assert(fs.existsSync(filePath), `Expected path to exist: ${filePath}`)
}

function assertFileSize(filePath, minBytes) {
  const stat = fs.statSync(filePath)
  assert(stat.isFile(), `Expected file: ${filePath}`)
  assert(stat.size >= minBytes, `Expected ${filePath} to be at least ${minBytes} bytes, got ${stat.size}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

main()
