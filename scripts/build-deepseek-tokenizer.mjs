// 把官方 DeepSeek tokenizer.json 压成「只要合并表」的 TypeScript 模块。
//
// 为什么要这一步:tokenizer.json 有 6.3MB,里面的 vocab(128k 条 token→id)、
// normalizer、decoder、post_processor 对**数 token**这件事全是死重 —— 数 token
// 只需要「合并的先后顺序」(merges)和特殊 token 的字面量。这里把这两样抠出来,
// 生成一个约 1.3MB 的 `.ts` 模块,由编译器/打包器原样内联进产物:
//
//   - 不用在运行时读文件 → 不存在「装进 DSH profile 后找不到资源」这种失败模式;
//   - 不依赖 wasm / 原生模块 → 宿主半是纯 JS,Electron 侧同样吃;
//   - 不做 JSON.parse(6.3MB) → 省掉首发的解析开销。
//
// 用法(需要官方 tokenizer.json):
//   node scripts/build-deepseek-tokenizer.mjs <path/to/tokenizer.json>
//
// 产物:src/tokenizer/deepseek-v4-vocab.generated.ts(可提交,也可以随时重跑覆盖)。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const outFile = join(pkg, "src", "tokenizer", "deepseek-v4-vocab.generated.ts");

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/build-deepseek-tokenizer.mjs <tokenizer.json>");
  process.exit(1);
}

const raw = readFileSync(source);
const sha = createHash("sha256").update(raw).digest("hex").slice(0, 16);
const json = JSON.parse(raw.toString("utf8"));

if (json.model?.type !== "BPE") {
  console.error(`unexpected model.type=${json.model?.type}, expected BPE`);
  process.exit(1);
}
const merges = json.model.merges;
if (!Array.isArray(merges) || merges.length === 0) {
  console.error("tokenizer.json has no model.merges");
  process.exit(1);
}
for (const line of merges) {
  if (typeof line !== "string" || line.split(" ").length !== 2) {
    console.error(`unexpected merge line (want exactly two space-separated parts): ${JSON.stringify(line)}`);
    process.exit(1);
  }
}

// added_tokens:只要字面量。`special` 的那批是聊天模板标记(<｜User｜> 之类),
// 分词器会先把它们整段摘出来当成一个 token,不走 BPE —— 数 token 时要照做。
const added = (json.added_tokens ?? []).map((t) => t.content).filter((c) => typeof c === "string" && c !== "");
// 长 token 优先匹配(和 HF 的 added vocabulary 一致)。
added.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));

/** 模板字符串里只需要转义反斜杠、反引号和 `${`。 */
function esc(text) {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

const header = `/**
 * 自动生成,勿手改 —— 见 scripts/build-deepseek-tokenizer.mjs。
 *
 * 来源:DeepSeek V4 官方 tokenizer.json(sha256:${sha}…)
 * merges ${merges.length} 条 / added ${added.length} 条。
 *
 * 只保留了数 token 需要的两样东西:字节级 BPE 的合并顺序表 + 特殊 token 字面量。
 * vocab、normalizer、decoder 一概没带 —— 我们从不生成 token id,只数个数。
 */

/** 每行一条 \`left right\` 合并规则,**行号就是优先级**(越靠前越先合并)。 */
export const DEEPSEEK_MERGES: string = \`${esc(merges.join("\n"))}\`;

/** 特殊 token 字面量,按长度降序(匹配时长的先试)。 */
export const DEEPSEEK_ADDED_TOKENS: string = \`${esc(added.join("\n"))}\`;
`;

writeFileSync(outFile, header, "utf8");
console.log(`wrote ${outFile}`);
console.log(`  merges ${merges.length} (${(merges.join("\n").length / 1024 / 1024).toFixed(2)} MiB)`);
console.log(`  added  ${added.length}`);
console.log(`  file   ${(header.length / 1024 / 1024).toFixed(2)} MiB`);
