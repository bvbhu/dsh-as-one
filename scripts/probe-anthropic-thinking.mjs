// M0 门禁实验：MiniMax 直连 LLM 端点（Anthropic Messages 方言）的思考块行为
//
// 只读探针：只从 as-one.db 读凭据（readOnly），不改库、不改网关、不写生产文件。
// 输出：.m0/results.json（原始观测）+ 终端摘要。授权信息绝不打印。
//
// 用法：node scripts/probe-anthropic-thinking.mjs
//   （可用环境变量 AS_ONE_DB 覆盖库路径；MINIMAX_BASE 覆盖 base）

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = process.env.AS_ONE_DB ?? join(process.env.USERPROFILE ?? "", ".as-one", "as-one.db");
const BASE = process.env.MINIMAX_BASE ?? "https://agent.minimaxi.com";
const PATH = "/mavis/api/v1/llm/v1/messages";
const VERSION = process.env.MINIMAX_ANTHROPIC_VERSION ?? "2023-06-01";
const MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-M3.1-Flash";
const OUT_DIR = join(process.cwd(), ".m0");

// ---------------------------------------------------------------------------
// 凭据（只读）
// ---------------------------------------------------------------------------

function loadCredentials() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT username, secret, expires_at FROM credential WHERE provider='minimax' ORDER BY expires_at DESC",
      )
      .all()
      .map((r) => ({ username: String(r.username), secret: String(r.secret), expiresAt: r.expires_at }));
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function post(secret, body, { stream = false, timeoutMs = 120_000 } = {}) {
  const startedAt = Date.now();
  const res = await fetch(BASE + PATH, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "anthropic-version": VERSION,
    },
    body: JSON.stringify({ ...body, stream }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  const ms = Date.now() - startedAt;
  return { status: res.status, text, ms };
}

/** SSE → 事件类型序列 + 块类型序列 + 关键事实。 */
function summarizeStream(text) {
  const types = [];
  const blockTypes = [];
  let thinkingDeltaChars = 0;
  let textDeltaChars = 0;
  let signature = "";
  let stopReason;
  let usage;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "" || data === "[DONE]") continue;
    let ev;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    const t = typeof ev.type === "string" ? ev.type : "?";
    if (types[types.length - 1] !== t) types.push(t);
    if (t === "content_block_start") {
      const bt = String(ev.content_block?.type ?? "?");
      blockTypes.push(bt);
      if (bt === "thinking") signature = String(ev.content_block.signature ?? "");
    }
    if (t === "content_block_delta") {
      if (ev.delta?.type === "thinking_delta") thinkingDeltaChars += String(ev.delta.thinking ?? "").length;
      if (ev.delta?.type === "text_delta") textDeltaChars += String(ev.delta.text ?? "").length;
    }
    if (t === "message_delta") {
      stopReason = ev.delta?.stop_reason ?? stopReason;
      usage = ev.usage ?? usage;
    }
    if (t === "message_start") usage = ev.message?.usage ?? usage;
  }
  return {
    types: [...new Set(types)],
    blockTypes,
    thinkingDeltaChars,
    textDeltaChars,
    signatureLen: signature.length,
    stopReason,
    usage,
  };
}

/** 非流式响应摘要（块类型 / 签名 / usage / stop_reason / 错误原文）。 */
function summarizeJson(status, text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { status, parseError: true, raw: text.slice(0, 400) };
  }
  const blocks = Array.isArray(json.content) ? json.content : [];
  const errorLike = json.type === "error" || json.base_resp?.status_code > 0 || json.error !== undefined;
  return {
    status,
    type: json.type,
    stopReason: json.stop_reason,
    usage: json.usage,
    blocks: blocks.map((b) => ({
      type: b.type,
      textLen: typeof b.text === "string" ? b.text.length : undefined,
      thinkingLen: typeof b.thinking === "string" ? b.thinking.length : undefined,
      signature: typeof b.signature === "string" ? b.signature : undefined,
      toolUseId: b.type === "tool_use" ? b.id : undefined,
    })),
    errorLike,
    ...(errorLike ? { errorRaw: text.slice(0, 500) } : {}),
  };
}

// ---------------------------------------------------------------------------
// 实验
// ---------------------------------------------------------------------------

const THINK_PROMPT = "91 是不是质数？先在心里推演，最后只回一个词：prime 或 composite。";
const REPLAY_PROMPT = "换一个：111 是不是质数？同样只回一个词。";
const TOOL_PROMPT = "用 get_time 工具查一下当前时间，然后只回一个词：done。";

const TOOLS = [
  {
    name: "get_time",
    description: "取当前时间",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

function baseMessages() {
  return [{ role: "user", content: [{ type: "text", text: THINK_PROMPT }] }];
}

function withReplay(assistantBlocks, { signature, prefixSystem } = {}) {
  const blocks = assistantBlocks
    .filter((b) => b.type === "thinking" || b.type === "text" || b.type === "tool_use")
    .map((b) => {
      if (b.type === "thinking") {
        const out = { type: "thinking", thinking: b.thinking ?? "" };
        if (signature === "real") out.signature = b.signature;
        else if (typeof signature === "string") out.signature = signature;
        return out;
      }
      return b;
    });
  const messages = [
    ...baseMessages(),
    { role: "assistant", content: blocks },
    { role: "user", content: [{ type: "text", text: REPLAY_PROMPT }] },
  ];
  const body = { model: MODEL, max_tokens: 1024, messages, output_config: { effort: "high" } };
  if (prefixSystem) body.system = prefixSystem;
  return body;
}

function ok(res) {
  return res.status >= 200 && res.status < 300 && res.json?.errorLike !== true;
}

async function run() {
  const creds = loadCredentials();
  if (creds.length === 0) throw new Error("as-one.db 里没有 minimax 凭据");

  const results = { startedAt: new Date().toISOString(), model: MODEL, base: BASE, specs: {}, runs: {} };

  // 选一个能产出 thinking 块的凭据（作为后续回放实验的母本）
  let picked = null;
  let baseline = null;
  for (const cred of creds) {
    const res = await post(cred.secret, {
      model: MODEL,
      max_tokens: 1024,
      messages: baseMessages(),
      output_config: { effort: "high" },
    });
    const summary = summarizeJson(res.status, res.text);
    results.runs[`pick/${cred.username}`] = { ms: res.ms, ...summary };
    if (ok({ status: res.status, json: summary }) && (summary.blocks ?? []).some((b) => b.type === "thinking")) {
      picked = cred;
      baseline = summary;
      break;
    }
    if (picked === null && ok({ status: res.status, json: summary })) {
      picked = cred;
      baseline = summary;
    }
  }
  if (picked === null) throw new Error("两个 minimax 凭据都没有可用响应");
  results.picked = picked.username;
  const secret = picked.secret;
  const assistantBlocks = baseline.blocks ?? [];

  const send = async (name, body, opts) => {
    const res = await post(secret, body, opts);
    results.runs[name] =
      opts?.stream === true
        ? { ms: res.ms, status: res.status, stream: summarizeStream(res.text) }
        : { ms: res.ms, ...summarizeJson(res.status, res.text) };
    return results.runs[name];
  };

  // A/B：签名校验面（母本用真实签名的那个账号）
  const hasRealThinking = assistantBlocks.some((b) => b.type === "thinking" && b.signature);
  if (hasRealThinking) {
    await send("E2_replay_real_signature", withReplay(assistantBlocks, { signature: "real" }));
    await send("E3_replay_no_signature", withReplay(assistantBlocks, {}));
    await send("E4_replay_fake_signature", withReplay(assistantBlocks, { signature: "f".repeat(64) }));
    await send(
      "E5_replay_changed_prefix",
      withReplay(assistantBlocks, { signature: "real", prefixSystem: "你现在是一个严格的判题器。" }),
    );
    // E11：外来思考文本（不是本模型产生的）能不能回放
    await send(
      "E11_foreign_thinking",
      withReplay(
        [
          { type: "thinking", thinking: "我在别的模型里已经想过：111 能被 3 整除，所以不是质数。", signature: undefined },
          ...assistantBlocks.filter((b) => b.type === "text"),
        ],
        {},
      ),
    );
  }

  // C：adaptive + effort
  await send("E6_adaptive_effort", {
    model: MODEL,
    max_tokens: 1024,
    messages: baseMessages(),
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
  });

  // D：disabled / budget_tokens（两个 max_tokens 档）
  await send("E7_thinking_disabled", {
    model: MODEL,
    max_tokens: 1024,
    messages: baseMessages(),
    thinking: { type: "disabled" },
  });
  await send("E8a_thinking_budget_1024", {
    model: MODEL,
    max_tokens: 1024,
    messages: baseMessages(),
    thinking: { type: "enabled", budget_tokens: 512 },
  });
  await send("E8b_thinking_budget_4096", {
    model: MODEL,
    max_tokens: 4096,
    messages: baseMessages(),
    thinking: { type: "enabled", budget_tokens: 2048 },
  });

  // E：流式（网关实际形态）
  await send(
    "E9_stream_effort",
    { model: MODEL, max_tokens: 4096, messages: baseMessages(), output_config: { effort: "high" } },
    { stream: true },
  );
  if (hasRealThinking) {
    await send("E12_stream_replay_no_signature", withReplay(assistantBlocks, {}), { stream: true });
    await send("E12b_stream_replay_real_signature", withReplay(assistantBlocks, { signature: "real" }), {
      stream: true,
    });
  }

  // F：工具轮 + 回放（同一次响应里取 id，避免两次响应 id 漂移）
  const toolRaw = await post(secret, {
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: [{ type: "text", text: TOOL_PROMPT }] }],
    tools: TOOLS,
    output_config: { effort: "high" },
  });
  let toolBlocks = [];
  try {
    toolBlocks = JSON.parse(toolRaw.text).content ?? [];
  } catch {}
  results.runs.E10a_tool_round = { ms: toolRaw.ms, ...summarizeJson(toolRaw.status, toolRaw.text) };
  const toolUse = toolBlocks.find((b) => b.type === "tool_use");
  if (toolUse) {
    const replay = {
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: "high" },
      tools: TOOLS,
      messages: [
        { role: "user", content: [{ type: "text", text: TOOL_PROMPT }] },
        { role: "assistant", content: toolBlocks },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolUse.id, content: "2026-11-20T12:00:00Z" }],
        },
      ],
    };
    await send("E10b_tool_replay_with_thinking", replay);
    await send("E10c_tool_replay_without_thinking", {
      ...replay,
      messages: [
        replay.messages[0],
        { role: "assistant", content: toolBlocks.filter((b) => b.type !== "thinking") },
        replay.messages[2],
      ],
    });
    await send("E10d_tool_replay_stream", replay, { stream: true });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2), "utf8");

  // 终端摘要
  for (const [name, r] of Object.entries(results.runs)) {
    const head =
      r.stream !== undefined
        ? `status=${r.status} stream=${JSON.stringify(r.stream).slice(0, 200)}`
        : `status=${r.status} blocks=${(r.blocks ?? []).map((b) => b.type + (b.signature ? "+sig" : "")).join(",")} stop=${r.stopReason ?? "?"}${r.errorLike ? " ERROR=" + String(r.errorRaw ?? "").slice(0, 160) : ""}`;
    console.log(`${name.padEnd(32)} ${head} (${r.ms}ms)`);
  }
  console.log(`\npicked=${picked.username} hasRealThinking=${hasRealThinking}`);
  console.log(`results -> ${join(OUT_DIR, "results.json")}`);
}

run().catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exitCode = 1;
});
