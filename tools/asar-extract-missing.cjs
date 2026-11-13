// Batch-extracts README/package.json/main entry (+ lib/types if small) for listed @deepseek-ai packages
// into D:\projects\as-one\.tmp-probe\docs\<pkg>\  (skips files already present).
// Runs under: DeepSeek Harness.exe --expose-internals tools/asar-extract-missing.cjs (ELECTRON_RUN_AS_NODE=1)
const fs = require('node:fs')
const path = require('node:path')
const ASAR = 'D:\\Program Files\\deepseek HARNESS\\resources\\app.asar'
const PKGS = [
  'dsh-atomic-write', 'dsh-client-connection', 'dsh-client-locale',
  'dsh-client-ui-conversation', 'dsh-client-ui-primitives', 'dsh-client-ui-settings', 'dsh-client-ui-slots',
  'dsh-commands', 'dsh-home-paths', 'dsh-host-plugin-inventory',
  'dsh-llm-pi-ai', 'dsh-llm-retry', 'dsh-api-gateway',
  'dsh-session', 'dsh-session-persistence', 'dsh-settings',
  'dsh-storage', 'dsh-storage-json', 'dsh-subprocess-local', 'dsh-typert-protocol',
]
const FILES = ['README.md', 'README.zh.md', 'README.i18n.yaml', 'package.json', 'LICENSE']
const OUT = 'D:\\projects\\as-one\\.tmp-probe\\docs'
const base = path.join(ASAR, 'dsh', 'node_modules', '@deepseek-ai')
const MAX_LIB_BYTES = 800000

function copyTree(srcDir, dstDir, depth = 0) {
  if (depth > 5) return 0
  let n = 0
  let entries = []
  try { entries = fs.readdirSync(srcDir, { withFileTypes: true }) } catch { return 0 }
  for (const e of entries) {
    if (e.name === 'node_modules') continue
    const s = path.join(srcDir, e.name)
    const d = path.join(dstDir, e.name)
    if (e.isDirectory()) {
      fs.mkdirSync(d, { recursive: true })
      n += copyTree(s, d, depth + 1)
    } else if (e.isFile()) {
      try {
        fs.mkdirSync(dstDir, { recursive: true })
        fs.writeFileSync(d, fs.readFileSync(s))
        n++
      } catch (err) { console.log(`   skip ${s}: ${err.message}`) }
    }
  }
  return n
}

function libSize(pkgDir) {
  let total = 0
  const walk = (d, depth) => {
    if (depth > 5) return
    let entries = []
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name === 'node_modules') continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p, depth + 1)
      else if (e.isFile()) { try { total += fs.statSync(p).size } catch {} }
    }
  }
  const lib = path.join(pkgDir, 'lib')
  try { if (fs.statSync(lib).isDirectory()) walk(lib, 0) } catch {}
  return total
}

for (const name of PKGS) {
  const pkgDir = path.join(base, name)
  if (!fs.existsSync(pkgDir)) { console.log(`!! ${name}: NOT FOUND in asar`); continue }
  const outDir = path.join(OUT, name)
  fs.mkdirSync(outDir, { recursive: true })
  let copied = 0
  for (const f of FILES) {
    const src = path.join(pkgDir, f)
    if (!fs.existsSync(src)) continue
    const dst = path.join(outDir, f)
    if (fs.existsSync(dst)) continue
    try { fs.writeFileSync(dst, fs.readFileSync(src)); copied++ } catch (err) { console.log(`   ${f}: ${err.message}`) }
  }
  let pkg = {}
  try { pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) } catch {}
  const main = pkg.main || 'lib/index.js'
  const srcMain = path.join(pkgDir, main)
  const dstMain = path.join(outDir, path.basename(main))
  if (fs.existsSync(srcMain) && !fs.existsSync(dstMain)) {
    try { fs.writeFileSync(dstMain, fs.readFileSync(srcMain)); copied++ } catch (err) { console.log(`   main: ${err.message}`) }
  }
  const size = libSize(pkgDir)
  if (size > 0 && size <= MAX_LIB_BYTES) {
    const dstLib = path.join(outDir, 'lib')
    if (!fs.existsSync(dstLib)) {
      const n = copyTree(path.join(pkgDir, 'lib'), dstLib)
      copied += n
    }
  } else if (size > MAX_LIB_BYTES) {
    console.log(`   ${name}: lib/ ${(size / 1024).toFixed(0)}KB — skipped (only entry copied)`)
  }
  console.log(`OK ${name} (${copied} new files)`)
}
console.log('done')
