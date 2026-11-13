// Lists every @deepseek-ai/* package inside resources/app.asar with version + dsh manifest keys.
// Runs under: DeepSeek Harness.exe --expose-internals tools/asar-list.cjs  (ELECTRON_RUN_AS_NODE=1)
const fs = require('node:fs')
const path = require('node:path')

const ASAR = 'D:\\Program Files\\deepseek HARNESS\\resources\\app.asar'
const base = path.join(ASAR, 'dsh', 'node_modules', '@deepseek-ai')

const rows = []
for (const entry of fs.readdirSync(base)) {
  const dir = path.join(base, entry)
  if (!fs.statSync(dir).isDirectory()) continue
  const pkgPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) { rows.push([entry, '?', 'no package.json', '']); continue }
  let pkg = {}
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) } catch { rows.push([entry, '?', 'bad json', '']); continue }
  const dsh = pkg.dsh ? Object.keys(pkg.dsh).join('+') : ''
  const kind = pkg.dsh && pkg.dsh.bundle ? 'bundle' : (pkg.dsh ? 'other' : 'lib')
  rows.push([entry, pkg.version || '?', kind, dsh])
}
rows.sort((a, b) => a[0].localeCompare(b[0]))
for (const [n, v, k, d] of rows) console.log(`${n.padEnd(42)} ${String(v).padEnd(14)} ${k.padEnd(8)} ${d}`)
console.log(`\ntotal: ${rows.length}`)

// Also: any storage backend packages?
console.log('\n--- storage-related ---')
for (const [n, v, k, d] of rows) if (n.includes('storage') || n.includes('sqlite') || n.includes('kv')) console.log(`${n} ${v}`)
