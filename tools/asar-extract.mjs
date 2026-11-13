// Minimal asar reader: extract selected paths from an Electron app.asar.
// Usage: node tools/asar-extract.mjs <asarPath> <outDir> [filterPrefix...]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'

const [, , asarPath, outDir, ...filters] = process.argv
if (!asarPath || !outDir) {
  console.error('usage: node tools/asar-extract.mjs <asarPath> <outDir> [filterPrefix...]')
  process.exit(2)
}

const fd = readFileSync(asarPath)
// header: uint32(4) | headerSize pickle | payload
function readPickle(buf, offset = 0) {
  // Electron asar header pickle: uint32(4) uint32(headerSize) uint32(jsonSize) then jsonSize bytes
  const headerSize = buf.readUInt32LE(offset + 4)
  const jsonSize = buf.readUInt32LE(offset + 8)
  const json = buf.slice(offset + 12, offset + 12 + jsonSize).toString('utf8')
  // payload starts right after the pickle: 4 + headerSize (chromium aligns headerSize to 4)
  const aligned = headerSize + (4 - (headerSize % 4)) % 4
  return { header: JSON.parse(json), payloadOffset: offset + 4 + aligned }
}

const { header, payloadOffset } = readPickle(fd, 0)
let count = 0
let bytes = 0

function walk(node, prefix) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) walk(child, prefix ? `${prefix}/${name}` : name)
    return
  }
  if (!node.offset) return
  const rel = prefix
  if (filters.length && !filters.some((f) => rel.startsWith(f))) return
  const start = payloadOffset + Number(node.offset)
  const buf = fd.slice(start, start + Number(node.size))
  const target = join(outDir, rel.split('/').join(sep))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, buf)
  count++
  bytes += buf.length
}

walk(header, '')
console.log(`extracted ${count} files, ${(bytes / 1048576).toFixed(1)} MiB -> ${outDir}`)
