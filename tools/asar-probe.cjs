// Runs inside the DSH Electron binary in ELECTRON_RUN_AS_NODE mode so that
// Node's fs is asar-aware: we can list/read inside resources/app.asar.
const fs = require('node:fs')
const path = require('node:path')

const ASAR = 'D:\\Program Files\\deepseek HARNESS\\resources\\app.asar'
const base = path.join(ASAR, 'dsh', 'node_modules', '@deepseek-ai')

const targets = ['dsh-llm', 'dsh-llm-pi-ai', 'dsh-host-webserver', 'dsh-storage', 'dsh-storage-domain']
for (const t of targets) {
  const dir = path.join(base, t)
  if (!fs.existsSync(dir)) {
    console.log(`MISSING ${t}`)
    continue
  }
  const pkgPath = path.join(dir, 'package.json')
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : {}
  console.log(`\n=== ${t} === version=${pkg.version || '?'} main=${pkg.main || '?'} types=${pkg.types || '?'}`)
  const lib = path.join(dir, 'lib')
  if (fs.existsSync(lib)) {
    const walk = (d, prefix = '') => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name
        const full = path.join(d, e.name)
        if (e.isDirectory()) walk(full, rel)
        else if (e.name.endsWith('.d.ts') || e.name.endsWith('.js')) {
          console.log(`  ${(fs.statSync(full).size / 1024).toFixed(1).padStart(8)} KB  ${rel}`)
        }
      }
    }
    walk(lib)
  }
}
