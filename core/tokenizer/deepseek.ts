/**
 * DeepSeek V4 官方 tokenizer(纯 TS,零依赖)—— 用来**精确**数 prompt token。
 *
 * ## 为什么要自己撸一个
 *
 * `gateway-upstream-context.ts` 原来只能按字符宽度猜(中日韩 0.75 token/字),
 * 因为「精确分词要上游的 tokenizer」。猜错的代价是双向的:
 *
 * - 猜高了 → 明明装得下也去裁,把用户的上下文白扔;
 * - 猜低了 → 发过去被上游 400 打回,用户看到一条红字等 30 秒。
 *
 * 用户把 DeepSeek V4 的 `tokenizer.json` 给了我们 —— 那就没有「拿不到」的借口。
 *
 * ## 为什么不是「原样加载 tokenizer.json」
 *
 * 那个文件 6.3MB,其中 vocab(128k 条 token→id)、normalizer、decoder、
 * post_processor 对**数个数**这件事全是死重。数 token 只需要:
 *
 * 1. 字节级 BPE 的**合并顺序**(merges,127741 条);
 * 2. 特殊 token 的字面量(1283 条,`<｜User｜>` 这种)。
 *
 * 于是 `scripts/build-deepseek-tokenizer.mjs` 把它压成 1.1MB 的 TS 模块直接内联
 * 进产物 —— 不读文件、不用 wasm、不依赖原生模块,DSH 宿主半与 Electron 通吃。
 *
 * ## 与官方实现对得上吗
 *
 * 对得上。流水线和 `tokenizer.json` 里写的一模一样:
 *
 * - PreTokenizer 是三个 `Split`(`\p{N}{1,3}` / CJK 段 / GPT-2 那串大类),
 *   全部 `Isolated` —— 命中的片段与片段间的空隙都算独立片段;
 * - 再走 `ByteLevel`(`use_regex: false`,只做字节→可见字符的映射);
 * - 最后是标准 BPE:反复合并「优先级最高(这对在下表里最靠前)」的相邻对。
 *
 * `test/deepseek-tokenizer.test.ts` 里钉了 40 多条**官方 Python tokenizers 实测**
 * 出来的黄金向量(连 token 串都逐字比),不是「我觉得对」。
 */

import { DEEPSEEK_ADDED_TOKENS, DEEPSEEK_MERGES } from "./deepseek-v4-vocab.generated.js";

// ---------------------------------------------------------------------------
// 字节 ↔ 可见字符(HF ByteLevel 的 bytes_to_unicode)
// ---------------------------------------------------------------------------

/**
 * 把 0..255 映射成「一个可见字符」,让 BPE 能对任意二进制安全地做符号运算。
 *
 * 规则与 GPT-2 / HF 逐字一致:可打印 ASCII 与 Latin-1 的后半段原样保留,
 * 其余 68 个字节挪到 U+0100 之后的区间 —— 这样不会和真实文本撞车。
 */
function buildByteToChar(): string[] {
  const table = new Array<string>(256);
  const keep: number[] = [];
  for (let b = "!".charCodeAt(0); b <= "~".charCodeAt(0); b += 1) keep.push(b);
  for (let b = 0xa1; b <= 0xac; b += 1) keep.push(b);
  for (let b = 0xae; b <= 0xff; b += 1) keep.push(b);
  const kept = new Set(keep);
  for (const b of keep) table[b] = String.fromCharCode(b);
  let extra = 256;
  for (let b = 0; b < 256; b += 1) {
    if (kept.has(b)) continue;
    table[b] = String.fromCharCode(extra);
    extra += 1;
  }
  return table;
}

const BYTE_TO_CHAR = buildByteToChar();

/**
 * 生成的文件如果被编辑器/git 换成 CRLF,按换行切出来的每条 merges 行尾都会
 * 多一个回车符 —— 于是「Ġ t」变成「Ġ t + 回车」,一条都匹配不上,分词结果
 * 静默变错(不报错,只是数出来的 token 数偏大)。这里一次清掉,正常情况下
 * 是空操作、连字符串都不复制。
 */
function normalizeGenerated(raw: string): string {
  return raw.includes("\r") ? raw.replace(/\r/g, "") : raw;
}

const MERGES_TEXT = normalizeGenerated(DEEPSEEK_MERGES);
const ADDED_TEXT = normalizeGenerated(DEEPSEEK_ADDED_TOKENS);
/**
 * `id 空间`上限:0..255 是单字节符号,此后每命中一条 merge 新增一个。
 *
 * 两个字段(优先级 rank / 合并后符号 id)都 < 2^17,打包成 `rank * 2^17 + id`
 * 一个 number 存在同一个 Map 里 —— 127k 条规则用一张表而不是两张,省一半内存,
 * 而且最大值 1.6e10 远小于 2^53,double 精确。
 */
const MAX_SYMBOLS = 1 << 17;

// ---------------------------------------------------------------------------
// 合并表(懒构建)
// ---------------------------------------------------------------------------

interface MergeTable {
  /** 相邻对 key(`a * MAX_SYMBOLS + b`)→ 打包值 `rank * MAX_SYMBOLS + 合并后 id`。 */
  pair: Map<number, number>;
  /** 符号 id → 字节级字符串(只有调试/测试用;合并过程不需要)。 */
  text: string[];
  /** 表里实际生效的 merge 条数(理论上等于文件行数)。 */
  size: number;
}

let table: MergeTable | null = null;
let tableBuildMs = 0;

function getTable(): MergeTable {
  if (table !== null) return table;
  const started = Date.now();
  const text: string[] = BYTE_TO_CHAR.slice(0, 256);
  const known = new Map<string, number>();
  for (let b = 0; b < 256; b += 1) known.set(BYTE_TO_CHAR[b] as string, b);

  const pair = new Map<number, number>();
  let rank = 0;
  let size = 0;
  for (const line of MERGES_TEXT.split("\n")) {
    if (line === "") continue;
    const cut = line.indexOf(" ");
    if (cut <= 0) continue;
    const left = known.get(line.slice(0, cut));
    const right = known.get(line.slice(cut + 1));
    const currentRank = rank;
    rank += 1;
    // 操作数解析不出来只可能是词表自相矛盾;跳过这一条,别让整条链路炸掉。
    if (left === undefined || right === undefined) continue;
    const id = text.length;
    if (id >= MAX_SYMBOLS) break;
    const merged = (text[left] as string) + (text[right] as string);
    text.push(merged);
    known.set(merged, id);
    const key = left * MAX_SYMBOLS + right;
    // 同一对重复出现时以**先出现**的为准(BPE 的语义就是「第一次合并之后就没有这一对了」)。
    if (!pair.has(key)) pair.set(key, currentRank * MAX_SYMBOLS + id);
    size += 1;
  }

  tableBuildMs = Date.now() - started;
  table = { pair, text, size };
  return table;
}

// ---------------------------------------------------------------------------
// 特殊 token(added vocabulary)—— 前缀树
// ---------------------------------------------------------------------------

interface TrieNode {
  children: Map<string, TrieNode>;
  end: boolean;
}

const TRIE_ROOT: TrieNode = { children: new Map(), end: false };
let trieBuilt = false;
let specialSet: Set<string> | null = null;

/**
 * 1283 个特殊 token 的前缀树。
 *
 * 为什么不用「1283 条并列的正则」:在 JS 里那是一个巨大的 alternation,编译慢、
 * 匹配也不可控。用树的话只在遇到 `<` / `｜` 时才走(全部特殊 token 都以这两个
 * 字符开头),最坏 36 步(最长的 token 就 36 个字符)。
 */
function getTrie(): TrieNode {
  if (trieBuilt) return TRIE_ROOT;
  specialSet = new Set<string>();
  for (const raw of ADDED_TEXT.split("\n")) {
    if (raw === "") continue;
    specialSet.add(raw);
    let node = TRIE_ROOT;
    for (const ch of raw) {
      let next = node.children.get(ch);
      if (next === undefined) {
        next = { children: new Map<string, TrieNode>(), end: false };
        node.children.set(ch, next);
      }
      node = next;
    }
    node.end = true;
  }
  trieBuilt = true;
  return TRIE_ROOT;
}

/** 特殊 token 的首字符集合 —— 不在这两个字符上的位置连树都不用试。 */
const SPECIAL_HEADS = new Set<string>(["<", "\uff5c"]);

// ---------------------------------------------------------------------------
// 预处理:三个 Split(Isolated 语义)
// ---------------------------------------------------------------------------

/** `\p{N}{1,3}`:数字按 1~3 位切块(所以 "12345" = "123" + "45")。 */
const SPLIT_NUMBER = /\p{N}{1,3}/gu;
/** CJK / 平假名 / 片假名:连续段整块隔开。 */
const SPLIT_CJK = /[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff]+/gu;
/** GPT-2 那串大类(与 tokenizer.json 里的正则逐字对应)。 */
const SPLIT_WORD =
  /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~][A-Za-z]+|[^\r\n\p{L}\p{P}\p{S}]?[\p{L}\p{M}]+| ?[\p{P}\p{S}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+/gu;

/**
 * 按正则把文本切成「命中的片段 + 片段之间的空隙」——`Isolated` 就是这个语义。
 *
 * 结果写进 `out`(复用数组:一条 40 万字符的消息每层都新建数组的话,GC 会很明显)。
 */
function splitIsolated(text: string, re: RegExp, out: string[]): void {
  out.length = 0;
  re.lastIndex = 0;
  let last = 0;
  for (;;) {
    const m = re.exec(text);
    if (m === null) break;
    const hit = m[0];
    if (hit.length === 0) {
      re.lastIndex += 1;
      continue;
    }
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(hit);
    last = m.index + hit.length;
  }
  if (last < text.length) out.push(text.slice(last));
}

const levelA: string[] = [];
const levelB: string[] = [];
const levelC: string[] = [];

// ---------------------------------------------------------------------------
// 片段 → BPE 合并
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/**
 * 一段文本 → 字节级符号 id 序列。
 *
 * 纯 ASCII 走快路径:字节值就等于字符码,连编码都省了(日志/JSON 里绝大多数
 * 片段是 ASCII,这条路径吃掉大部分调用)。
 */
function toSymbols(piece: string): number[] {
  let ascii = true;
  for (let i = 0; i < piece.length; i += 1) {
    if (piece.charCodeAt(i) >= 0x80) {
      ascii = false;
      break;
    }
  }
  if (ascii) {
    const out = new Array<number>(piece.length);
    for (let i = 0; i < piece.length; i += 1) out[i] = piece.charCodeAt(i);
    return out;
  }
  const bytes = encoder.encode(piece);
  const out = new Array<number>(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) out[i] = bytes[i] as number;
  return out;
}

/** 短片段(绝大多数单词/标点)走 O(n²) 线性扫描:不分配堆、不建链表。 */
function mergeSmall(sym: number[], pair: Map<number, number>): number {
  let n = sym.length;
  while (n > 1) {
    let bestRank = Number.POSITIVE_INFINITY;
    let bestAt = -1;
    let bestId = 0;
    for (let i = 0; i + 1 < n; i += 1) {
      const packed = pair.get((sym[i] as number) * MAX_SYMBOLS + (sym[i + 1] as number));
      if (packed === undefined) continue;
      const rank = Math.floor(packed / MAX_SYMBOLS);
      if (rank < bestRank) {
        bestRank = rank;
        bestAt = i;
        bestId = packed - rank * MAX_SYMBOLS;
      }
    }
    if (bestAt < 0) break;
    sym[bestAt] = bestId;
    sym.copyWithin(bestAt + 1, bestAt + 2, n);
    n -= 1;
  }
  return n;
}

/** 堆的两个出堆值(避免为每次 pop 分配一个数组)。 */
let poppedRank = 0;

/** 长片段(整段中文、长 JSON 字符串)走「链表 + 最小堆」,避免 O(n²) 卡死。 */
function mergeLarge(sym: number[], pair: Map<number, number>): number {
  const cap = sym.length;
  const next = new Int32Array(cap);
  const prev = new Int32Array(cap);
  for (let i = 0; i < cap; i += 1) {
    next[i] = i + 1 < cap ? i + 1 : -1;
    prev[i] = i > 0 ? i - 1 : -1;
  }

  const hRank: number[] = [];
  const hPos: number[] = [];

  /** 二叉堆上浮;两条平行数组按 (rank, 位置) 排序,保证结果确定。 */
  const push = (rank: number, pos: number): void => {
    let i = hRank.length;
    hRank.push(rank);
    hPos.push(pos);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const pr = hRank[parent] as number;
      const pp = hPos[parent] as number;
      if (pr < rank || (pr === rank && pp <= pos)) break;
      hRank[i] = pr;
      hPos[i] = pp;
      i = parent;
    }
    hRank[i] = rank;
    hPos[i] = pos;
  };

  /** 出堆最小项,返回位置;优先级写进 {@link poppedRank}。 */
  const pop = (): number => {
    poppedRank = hRank[0] as number;
    const topPos = hPos[0] as number;
    const lastRank = hRank.pop() as number;
    const lastPos = hPos.pop() as number;
    const size = hRank.length;
    if (size > 0) {
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        if (left >= size) break;
        const right = left + 1;
        let best = left;
        if (right < size) {
          const lr = hRank[left] as number;
          const rr = hRank[right] as number;
          if (rr < lr || (rr === lr && (hPos[right] as number) < (hPos[left] as number))) best = right;
        }
        const br = hRank[best] as number;
        if (lastRank < br || (lastRank === br && lastPos <= (hPos[best] as number))) break;
        hRank[i] = br;
        hPos[i] = hPos[best] as number;
        i = best;
      }
      hRank[i] = lastRank;
      hPos[i] = lastPos;
    }
    return topPos;
  };

  for (let i = 0; i + 1 < cap; i += 1) {
    const packed = pair.get((sym[i] as number) * MAX_SYMBOLS + (sym[i + 1] as number));
    if (packed !== undefined) push(Math.floor(packed / MAX_SYMBOLS), i);
  }

  let count = cap;
  while (hRank.length > 0) {
    const pos = pop();
    const right = next[pos] as number;
    if (right < 0) continue;
    const packed = pair.get((sym[pos] as number) * MAX_SYMBOLS + (sym[right] as number));
    if (packed === undefined) continue;
    const rank = Math.floor(packed / MAX_SYMBOLS);
    // 堆里存的是**快照**:旁边合并过之后这一对的优先级可能已经变了。
    // 变了就丢掉 —— 变化那一刻已经为受影响的位置压过新条目了。
    if (rank !== poppedRank) continue;
    sym[pos] = packed - rank * MAX_SYMBOLS;
    count -= 1;
    const after = next[right] as number;
    next[pos] = after;
    // 被吃掉的那个位置必须标记成「空」:堆里可能还有以它为首的旧条目,
    // 不标记的话会把已经并进左边的符号再拿去做一次合并(计数变成负数)。
    next[right] = -1;
    if (after >= 0) prev[after] = pos;
    if (after >= 0) {
      const nPack = pair.get((sym[pos] as number) * MAX_SYMBOLS + (sym[after] as number));
      if (nPack !== undefined) push(Math.floor(nPack / MAX_SYMBOLS), pos);
    }
    const before = prev[pos] as number;
    if (before >= 0) {
      const pPack = pair.get((sym[before] as number) * MAX_SYMBOLS + (sym[pos] as number));
      if (pPack !== undefined) push(Math.floor(pPack / MAX_SYMBOLS), before);
    }
  }
  // 链表合并留下的结果散在任意下标上;压回前段,调用方才能按 [0, count) 读。
  // 下标 0 永远不可能被左边吃掉,所以它一定是链头。
  let write = 0;
  let cursor = 0;
  while (cursor >= 0) {
    sym[write] = sym[cursor] as number;
    write += 1;
    cursor = next[cursor] as number;
  }
  return count;
}

/** 片段长度超过这个数就切到堆版本(O(n²) 在几万符号上会明显卡)。 */
const SMALL_PIECE_LIMIT = 48;

/**
 * 就地把一串符号合并到底,压缩到 `[0, 返回值)`,返回最终符号个数。
 *
 * 计数的生产路径只用返回的个数;测试/诊断路径再去读前 n 个元素拿 token 串。
 * 两条路共用这一份实现 —— 否则「测的是 A、跑的是 B」是最经典的自欺。
 */
function mergeSymbols(sym: number[], pair: Map<number, number>): number {
  if (sym.length < 2) return sym.length;
  return sym.length <= SMALL_PIECE_LIMIT ? mergeSmall(sym, pair) : mergeLarge(sym, pair);
}

/** 一段「不含特殊 token」的文本 → token 数。 */
function countPlain(text: string, pair: Map<number, number>): number {
  if (text === "") return 0;
  let total = 0;
  splitIsolated(text, SPLIT_NUMBER, levelA);
  // levelA 在下面两层里不会被写(写的是 levelB / levelC),所以可以直接迭代。
  for (const chunkA of levelA) {
    splitIsolated(chunkA, SPLIT_CJK, levelB);
    for (const chunkB of levelB) {
      splitIsolated(chunkB, SPLIT_WORD, levelC);
      for (const piece of levelC) {
        if (piece === "") continue;
        total += mergeSymbols(toSymbols(piece), pair);
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// 文本 → 原子序列(普通片段 / 特殊 token)
// ---------------------------------------------------------------------------

/**
 * 把文本拆成「普通片段」和「特殊 token」两种原子。
 *
 * 官方分词器先摘 added token、再对剩下的走 BPE;不这么做的话 `<｜User｜>` 会被
 * 拆成一堆 `Ġ <` 之类的碎片,一条含几千个标记的工具结果就会多算出几万 token。
 */
function atoms(text: string): string[] {
  if (!text.includes("<") && !text.includes("\uff5c")) return [text];
  const trie = getTrie();
  const out: string[] = [];
  let plainFrom = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (!SPECIAL_HEADS.has(ch)) {
      i += 1;
      continue;
    }
    let node: TrieNode | undefined = trie.children.get(ch);
    let hitEnd = -1;
    let j = i;
    while (node !== undefined) {
      j += 1;
      if (node.end) hitEnd = j;
      if (j >= text.length) break;
      node = node.children.get(text[j] as string);
    }
    if (hitEnd > i) {
      if (i > plainFrom) out.push(text.slice(plainFrom, i));
      out.push(text.slice(i, hitEnd));
      i = hitEnd;
      plainFrom = hitEnd;
    } else {
      i += 1;
    }
  }
  if (plainFrom < text.length) out.push(text.slice(plainFrom));
  return out;
}

function isSpecialToken(piece: string): boolean {
  if (specialSet === null) getTrie();
  return specialSet !== null && specialSet.has(piece);
}

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

/**
 * 数一段文本在 DeepSeek V4 词表下有多少 token。
 *
 * 特殊 token(`<｜User｜>`、`<think>` …)按字面整段算 1 个 —— 官方分词器也是
 * 先摘它们、再对剩下的走 BPE。
 */
export function deepseekTokenCount(text: string): number {
  if (text === "") return 0;
  const { pair } = getTable();
  let total = 0;
  for (const atom of atoms(text)) {
    total += isSpecialToken(atom) ? 1 : countPlain(atom, pair);
  }
  return total;
}

/**
 * 逐 token 的字符串(字节级表示,与官方 `encoding.tokens` 同形)。
 *
 * 生产路径只用 {@link deepseekTokenCount};这里的存在意义是让测试能拿官方
 * Python tokenizers 的输出**逐字**对照,而不是只比个数。
 */
export function deepseekTokenTexts(text: string): string[] {
  if (text === "") return [];
  const { pair, text: symbols } = getTable();
  const out: string[] = [];
  for (const atom of atoms(text)) {
    if (isSpecialToken(atom)) {
      out.push(atom);
      continue;
    }
    splitIsolated(atom, SPLIT_NUMBER, levelA);
    for (const chunkA of levelA) {
      splitIsolated(chunkA, SPLIT_CJK, levelB);
      for (const chunkB of levelB) {
        splitIsolated(chunkB, SPLIT_WORD, levelC);
        for (const piece of levelC) {
          if (piece === "") continue;
          const sym = toSymbols(piece);
          const n = mergeSymbols(sym, pair);
          for (let k = 0; k < n; k += 1) out.push(symbols[sym[k] as number] ?? "");
        }
      }
    }
  }
  return out;
}

/** 合并表建好了吗(建表约 100~200ms,只发生一次)。 */
export function isDeepseekTokenizerReady(): boolean {
  return table !== null;
}

/** 建表耗时(毫秒);没建过是 0。 */
export function deepseekTokenizerBuildMs(): number {
  return tableBuildMs;
}

/** 表里实际生效的 merge 条数(诊断用;应当等于生成文件里的行数)。 */
export function deepseekMergeCount(): number {
  return getTable().size;
}

/**
 * 提前把表建好。
 *
 * 宿主启动后调一次(异步丢到下一个 tick),第一个请求就不用替建表买单 ——
 * 建表本身只要一两百毫秒,但恰好落在「用户按下回车」那一瞬间就很明显。
 */
export function warmupDeepseekTokenizer(): void {
  if (table !== null) return;
  const run = (): void => {
    try {
      getTable();
      getTrie();
    } catch {
      // 预热失败不影响正确性:真正要用的时候会再建一次(建不起来就走估算兜底)。
    }
  };
  const timer = setTimeout(run, 0);
  // Node 的 Timeout 有 unref;浏览器环境下没有,别因为这一点把启动流程挂住。
  (timer as unknown as { unref?: () => void }).unref?.();
}
