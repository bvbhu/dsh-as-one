// Grep inside app.asar (Electron-only fs).
// Usage: DeepSeek Harness.exe --expose-internals tools/asar-grep.cjs <relPath> <regex> [contextLines]
const fs = require('node:fs')
const path = require('node:path')
const ASAR = 'D:\\Program Files\\deepseek HARNESS\\resources\\app.asar'
const base = path.join(ASAR, 'dsh', 'node_modules', '@deepseek-ai')
const [rel, pattern, ctxArg] = process.argv.slice(2)
const ctx = Number(ctxArg || 0)
const full = path.join(base, rel)
if (!fs.existsSync(full)) { console.log(`MISSING ${rel}`); process.exit(1) }
const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/)
const re = new RegExp(pattern, 'i')
let hits = 0
lines.forEach((line, i) => {
  if (!re.test(line)) return
  hits++
  const from = Math.max(0, i - ctx)
  const to = Math.min(lines.length - 1, i + ctx)
  for (let k = from; k <= to; k++) console.log(`${String(k + 1).padStart(6)} ${k === i ? '>' : ' '} ${lines[k]}`)
  console.log('---')
})
console.log(`\n[${hits} hits in ${rel}]`)
