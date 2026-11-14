/**
 * 会话事件读取 —— 回填脚本共用的**唯一**入口。
 *
 * 为什么单独抽出来:跨会话去重是「账准不准」的关键(DSH 会把同一份历史 fork 成
 * 多份会话,实测 9-10 有 5 个内容相同的副本)。写两遍迟早分叉,分叉了就会一边
 * 对一边错,而且很难看出来。所以读取 + 去重只在这里实现一次。
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** 一个 `.zstd` 文件可能是多帧拼接(每次追加新开一帧),逐帧解压后拼回文本。 */
export function readZstdFrames(file) {
	const buf = readFileSync(file);
	const cuts = [];
	let i = 0;
	while ((i = buf.indexOf(ZSTD_MAGIC, i)) !== -1) {
		cuts.push(i);
		i += 4;
	}
	if (cuts.length === 0) throw new Error("没有 zstd 帧头: " + file);
	const parts = [];
	let start = 0;
	for (let k = 1; k <= cuts.length; k++) {
		const end = k < cuts.length ? cuts[k] : buf.length;
		try {
			parts.push(zstdDecompressSync(buf.subarray(start, end)));
			start = end;
		} catch {
			// 压缩流内部恰好出现 magic → 把这一段并到下一帧再试
		}
	}
	if (start < buf.length) parts.push(zstdDecompressSync(buf.subarray(start)));
	return Buffer.concat(parts).toString("utf8");
}

function walk(dir, out = []) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (e.name.endsWith(".jsonl.zstd")) out.push(p);
	}
	return out;
}

/**
 * 列出所有会话文件,按**会话目录名**去重(id 相同的留文件最大的那份)。
 *
 * 注意:这只解决"同一 id 存了两份"(sessions vs sessions-archive)的情况;
 * fork 出来的副本 id 不同、内容相同,靠下面的 `eventKey` 在事件层去重。
 */
export function listSessionFiles(home = process.env.HOME ?? process.env.USERPROFILE ?? ".") {
	const roots = [join(home, ".dsh", "sessions"), join(home, ".dsh", "sessions-archive")];
	const byId = new Map();
	for (const file of roots.flatMap((r) => walk(r))) {
		const id = file.split(/[\\/]/).at(-2) ?? file;
		const size = readFileSync(file).length;
		const prev = byId.get(id);
		if (!prev || size > prev.size) byId.set(id, { id, file, size });
	}
	return [...byId.values()];
}

/**
 * 事件去重键。
 *
 * - `assistant/message` → `message.id`(同一次模型响应唯一;fork 副本里一字不差),
 *   缺 id 时退回 `time|turn|step`;
 * - `step/start` / `llm/retry-started` / `turn/end` → `time|turn|step`;
 * - 其它事件 → null(不参与去重,重复也无副作用)。
 */
export function eventKey(event) {
	const d = event?.data ?? {};
	if (event.type === "assistant/message") {
		const id = d?.message?.id;
		if (typeof id === "string" && id !== "") return `m:${id}`;
		return `m:${event.time}|${d?.turn}|${d?.step}`;
	}
	if (event.type === "step/start" || event.type === "llm/retry-started" || event.type === "turn/end") {
		return `${event.type}:${event.time}|${d?.turn}|${d?.step}`;
	}
	return null;
}

/**
 * 读一个会话文件并产出事件(已跨会话去重)。
 *
 * `seen` 由调用方在**所有会话之间**共享 —— 传同一个 Set 才能跨 fork 副本去重。
 */
export function* sessionEvents(file, seen) {
	let text;
	try {
		text = readZstdFrames(file);
	} catch {
		return;
	}
	for (const line of text.split("\n")) {
		if (line === "") continue;
		let event;
		try {
			event = JSON.parse(line);
		} catch {
			continue;
		}
		if (typeof event?.type !== "string" || typeof event?.time !== "number") continue;
		const key = eventKey(event);
		if (key !== null) {
			if (seen.has(key)) continue;
			seen.add(key);
		}
		yield event;
	}
}
