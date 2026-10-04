#!/usr/bin/env node
/**
 * Build and package the app as an installer for the host OS (or an explicit target).
 *
 *   npm run package              auto-detect: macOS → dmg+zip, Linux → AppImage+deb, Windows → nsis
 *   npm run package -- --linux   force Linux (run this ON Linux)
 *   npm run package -- --mac     force macOS (run this ON macOS)
 *   npm run package -- --win     force Windows (run this ON Windows / CI)
 *   npm run package -- --dir     unpacked app directory only (no installer)
 *   npm run package -- --skip-build   reuse the existing dist/ instead of rebuilding
 *
 * electron-builder cross-compiles unreliably (Windows needs Wine, macOS dmg needs
 * macOS). For a given OS, build its installer on that same OS — e.g. the Linux
 * teammate runs `npm run package` on Linux and gets the AppImage + .deb.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const has = (flag) => args.includes(`--${flag}`)

const OS_TO_TARGET = { darwin: 'mac', win32: 'win', linux: 'linux' }
const TARGETS = { mac: ['dmg', 'zip'], win: ['nsis'], linux: ['AppImage', 'deb'] }
const EXTENSIONS = { mac: ['.dmg', '.zip'], win: ['.exe'], linux: ['.AppImage', '.deb'] }

if (has('help') || has('h')) {
  console.log(`Usage: npm run package [-- --mac|--win|--linux] [--dir] [--skip-build]

  (no flag)     build + package an installer for the current OS
  --mac         force a macOS installer (dmg + zip)
  --win         force a Windows installer (nsis)
  --linux       force a Linux installer (AppImage + deb)
  --dir         unpacked app directory only (no installer)
  --skip-build  reuse the existing dist/ instead of rebuilding`)
  process.exit(0)
}

const hostTarget = OS_TO_TARGET[process.platform]
const target = has('mac') ? 'mac' : has('win') ? 'win' : has('linux') ? 'linux' : hostTarget

if (!target) {
  console.error(`Unsupported host OS "${process.platform}". Pass --mac, --win, or --linux.`)
  process.exit(1)
}

const localBin = (name) =>
  join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name)

function run(command, cmdArgs) {
  console.log(`\n› ${command} ${cmdArgs.join(' ')}`)
  const result = spawnSync(command, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`Packaging "${target}" build on ${process.platform} (${process.arch}).`)
if (target !== hostTarget) {
  const on = { win: 'Windows', mac: 'macOS', linux: 'Linux' }[target]
  console.warn(`⚠  Forcing a ${target} build on ${process.platform} — cross-compiling is unreliable. Prefer building on ${on}.`)
}

if (!has('skip-build')) {
  run('npm', ['run', 'build'])
}

const ebArgs = ['--' + target]
if (has('dir')) ebArgs.push('--dir')
else ebArgs.push(...TARGETS[target])
run(localBin('electron-builder'), ebArgs)

const outDir = join(root, 'dist')
if (!has('dir') && existsSync(outDir)) {
  const artifacts = readdirSync(outDir).filter((name) =>
    EXTENSIONS[target].some((ext) => name.endsWith(ext)),
  )
  if (artifacts.length > 0) {
    console.log('\n✔ Installers:')
    for (const name of artifacts) {
      const mb = (statSync(join(outDir, name)).size / 1048576).toFixed(1)
      console.log(`   dist/${name}  (${mb} MB)`)
    }
  }
}
