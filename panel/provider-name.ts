/**
 * 供应商名的**归并口径**(2026-11-14 用户定案:网关历史名称归到网关,供应商名统一化)。
 *
 * 两件事,都只发生在**读数路径**(不改库里的历史行):
 *
 * 1. **网关自己的名字归到一个桶**:历史数据里网关可能以 `as-one` / `as_one` /
 *    `asone` / `as-one-gateway` / `dsh` / `gateway` 等写法出现(DSH 的
 *    `/v1/models` 里 `owned_by: "as-one"` 就是这种称呼)。它们不是一个"供应商",
 *    统一显示成 {@link GATEWAY_BUCKET},否则用量页会凭空多出一行叫 as-one 的厂商。
 *
 * 2. **同一供应商的不同写法合并**:大小写、连字符/下划线/空格/点号差异
 *    (`WorkBuddy` / `workbuddy` / `work-buddy`)归到 provider 表里的**规范 id**。
 *    ⚠️ 只合并"同一个名字的不同拼写",**不猜不同厂商的从属关系** ——
 *    `workbuddy_yn`(用户自建的中转,protocol=openai)与 `workbuddy` 是两条
 *    独立链路,合并会把两套凭据/额度算成一家,那是错账而不是美化。
 *
 * 为什么不写回库:历史行是**当时的事实**,改库会让"某天的数据"在事后变形;
 * 展示层归并没有这个副作用,且新增别名随时可加。
 */

/** 网关这一桶的显示名(同时用作聚合键)。 */
export const GATEWAY_BUCKET = "网关";

/**
 * 网关的别名(已归一:小写 + 去掉所有分隔符)。
 *
 * `asonegateway` 对应插件条目 id `as-one-gateway`;`dsh` / `gateway` 是宿主侧
 * 偶尔会拿来做 `provider` 的通用叫法。
 */
const GATEWAY_ALIASES: ReadonlySet<string> = new Set([
	"asone",
	"asonegateway",
	"dsh",
	"gateway",
	"网关",
]);

/** 归一化键:小写 + 去掉空格/连字符/下划线/点号。 */
export function providerNameKey(raw: string): string {
	return String(raw ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s\-_.]+/g, "");
}

/**
 * **历史名 → 现行供应商** 的别名表(键会被 {@link providerNameKey} 归一)。
 *
 * 只登记"同一个上游换过 id"的情况 —— 换名不换 API,所以并到一起才是对的账。
 * 判断依据写在每行注释里(数据来自本机 `stats_daily` 的活跃区间与模型交集),
 * 新增一条前先按同样的证据核一遍。
 *
 * ⚠️ 不要在这里登记"看起来像同一家"的独立渠道:`workbuddy` 与 `hyperai` 是两套
 * 凭据/额度,只有 `workbuddy_yn` 这种**用户自建的中转换名**才归并。
 */
export const PROVIDER_ALIASES: Readonly<Record<string, string>> = Object.freeze({
	// 用户自建的 yn 中转(protocol=openai,裸调 deepseek-v4.1-flash),2026-10-29~31
	// 只跑了 23 次就停用;上游就是 ai.hyperai.icu = 现行的 `hyperai`
	// (hyperai 最后一次用量 10-27,两段紧挨着,模型也重叠)。用户确认归到 hyperai。
	workbuddyyn: "hyperai",
});

/** 这个名字是不是"网关自己"? */
export function isGatewayProviderName(raw: string): boolean {
	return GATEWAY_ALIASES.has(providerNameKey(raw));
}

/**
 * 单个名字的归并:网关别名 → `网关`;其余只做 trim。
 *
 * 需要"同厂商不同拼写合并"时用 {@link createProviderCanonicalizer}(要有一份
 * 已知 provider 名单才谈得上"规范写法")。
 */
export function canonicalProviderName(raw: string): string {
	const name = String(raw ?? "").trim();
	if (name === "") return "";
	if (isGatewayProviderName(name)) return GATEWAY_BUCKET;
	return PROVIDER_ALIASES[providerNameKey(name)] ?? name;
}

/**
 * 造一个归并函数:已知的 provider id 是**规范写法**。
 *
 * 命中规则:归一后相等 → 用已知名单里的那个 id(与大小写/分隔符无关);
 * 没命中 → 保留原样(历史供应商,库里已没有 provider 行,不能瞎猜)。
 */
export function createProviderCanonicalizer(known: Iterable<string>): (raw: string) => string {
	const byKey = new Map<string, string>();
	// 排序保证同一归一键有多个写法时结果稳定(短的优先,再按字典序)。
	const ids = [...new Set([...known].map((k) => String(k ?? "").trim()).filter((k) => k !== ""))].sort(
		(a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
	);
	for (const id of ids) {
		const key = providerNameKey(id);
		if (key !== "" && !byKey.has(key)) byKey.set(key, id);
	}
	return (raw: string): string => {
		const name = String(raw ?? "").trim();
		if (name === "") return "";
		if (isGatewayProviderName(name)) return GATEWAY_BUCKET;
		const alias = PROVIDER_ALIASES[providerNameKey(name)];
		if (alias !== undefined) {
			// 别名指向的规范写法优先用现有 provider id(大小写可能不同)。
			return byKey.get(providerNameKey(alias)) ?? alias;
		}
		const hit = byKey.get(providerNameKey(name));
		return hit ?? name;
	};
}
