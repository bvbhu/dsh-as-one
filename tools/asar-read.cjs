// Reads selected files from inside app.asar (Electron-only fs).
// Usage: DeepSeek Harness.exe --expose-internals tools/asar-read.cjs <relPath...>
const fs = require('node:fs')
const path = require('node:path')
const ASAR = 'D:\\Program Files\\deepseek HARNESS\\resources\\app.asar'
const roots = [
  path.join(ASAR, 'dsh', 'node_modules', '@deepseek-ai'),
  path.join(ASAR, 'dsh', 'node_modules')
]
for (const rel of process.argv.slice(2)) {
  let full = null
  for (const r of roots) { const c = path.join(r, rel); if (fs.existsSync(c)) { full = c; break } }
  if (!full) { console.log(`\n===== ${rel} :: MISSING =====`); continue }
  console.log(`\n===== ${rel} (${(fs.statSync(full).size / 1024).toFixed(1)} KB) =====`)
  const text = fs.readFileSync(full, 'utf8')
  console.log(text.length > 12000 ? text.slice(0, 12000) + '\n...[truncated]' : text)
}
