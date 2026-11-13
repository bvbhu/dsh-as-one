// Dump selected files from inside resources/app.asar.
// Must run under the DSH Electron binary with ELECTRON_RUN_AS_NODE=1 so fs is asar-aware.
// Usage: electron --expose-internals tools/asar-dump.cjs <outDir> <relPathInsideAsar> [...]
const fs = require('node:fs')
const path = require('node:path')

const ASAR = 'D:\\Program Files\\deepseek HARNESS\\resources\\app.asar'
const [, , outDir, ...rels] = process.argv
if (!outDir || !rels.length) {
  console.error('usage: <exe> --expose-internals tools/asar-dump.cjs <outDir> <relPath> [...]')
  process.exit(2)
}

for (const rel of rels) {
  const src = path.join(ASAR, rel)
  if (!fs.existsSync(src)) {
    console.log(`MISSING ${rel}`)
    continue
  }
  const st = fs.statSync(src)
  if (st.isDirectory()) {
    const walk = (d, prefix) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const r = prefix ? `${prefix}/${e.name}` : e.name
        if (e.isDirectory()) walk(path.join(d, e.name), r)
        else dump(path.join(d, e.name), r)
      }
    }
    const dump = (full, r) => {
      const target = path.join(outDir, rel.split(/[\\/]/).join(path.sep), r.split('/').join(path.sep))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(full, target)
      console.log(`  ${(fs.statSync(full).size / 1024).toFixed(1).padStart(8)} KB  ${rel}/${r}`)
    }
    walk(src, '')
  } else {
    const target = path.join(outDir, rel.split(/[\\/]/).join(path.sep))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(src, target)
    console.log(`  ${(st.size / 1024).toFixed(1).padStart(8)} KB  ${rel}`)
  }
}
