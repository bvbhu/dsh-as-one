#!/usr/bin/env node
/**
 * scripts/bump-version.mjs —— 安全地改插件版本号。
 *
 * 为什么不用 PowerShell: `Set-Content -Encoding UTF8` 会写 BOM,把中文
 * description 双重编码毁掉(2026-11-07 踩过两次)。这里用 Node 按原文
 * UTF-8 读写,只动 version 一行。
 *
 * 用法: node scripts/bump-version.mjs 0.4.25
 */
import fs from "node:fs";

const target = "packages/dsh-plugin/package.json";
const next = process.argv[2];
if (!next || !/^\d+\.\d+\.\d+/.test(next)) {
  console.error("usage: node scripts/bump-version.mjs <version>  (e.g. 0.4.25)");
  process.exit(1);
}

const raw = fs.readFileSync(target, "utf8");
if (raw.charCodeAt(0) === 0xfeff) {
  console.error("refusing: file starts with BOM — restore it first (git checkout <good-commit> -- <path>)");
  process.exit(1);
}
const current = JSON.parse(raw).version;
const updated = raw.replace(new RegExp(`"version": "${current}"`), `"version": "${next}"`);
if (updated === raw) {
  console.error(`no version field found (current=${current})`);
  process.exit(1);
}
fs.writeFileSync(target, updated, "utf8");
const check = JSON.parse(fs.readFileSync(target, "utf8"));
console.log(`bumped: ${current} -> ${check.version}`);
