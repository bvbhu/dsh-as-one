/**
 * 历史供应商名的**逐条改写**表(2026-11-14 用户定案)。
 *
 * ## 纪律(改这张表前先读)
 *
 * 1. **不做通用归一化**。不按大小写 / 连字符 / 下划线去模糊匹配 —— 那种"看起来
 *    一样就合并"的规则会顺手把不同厂商算成一家,是错账。这里每一条都是看过
 *    `stats_daily` 的活跃区间和模型交集之后**人工写下来的**,键必须与原值完全相等。
 * 2. **网关的名字不在这张表里**。网关从不把 `as-one` 写进 `provider` 字段
 *    (`stats_daily.provider` 一直是真实厂商),所以不存在"把 as-one 归到网关"
 *    这回事;真要出现,说明写库路径出了 bug,该修写入侧,而不是在这里美化。
 * 3. **没登记的名字一律原样返回**。宁可显示裸 id,不猜。
 *
 * ## 为什么在读数层改写(而不是 UPDATE 历史行)
 *
 * 历史行是当时的事实;改库会让"某天的数据"在事后变形,而且不可逆。读数层
 * 改写随时可撤 —— 删掉一行就回到原始视图。
 */

/** 历史名 → 现行供应商。键是**原样字符串**(区分大小写)。 */
export const PROVIDER_RENAMES: Readonly<Record<string, string>> = Object.freeze({
	// ── 逐条核对记录 ────────────────────────────────────────────────
	// workbuddy_yn(本机 2026-10-29 ~ 10-31,23 次,只跑 deepseek-v4.1-flash)
	//   与 hyperai 的重叠:上游同为 ai.hyperai.icu,模型同为 deepseek-v4.1-flash;
	//   时间上 hyperai 最后一次用量是 10-27,workbuddy_yn 紧接着 10-29 开始 ——
	//   是"用户自建的中转换了个 id",不是两套独立渠道。用户 2026-11-14 确认归到 hyperai。
	workbuddy_yn: "hyperai",
});

/**
 * **已逐条核对、确认不需要改写**的历史名(留档,免得下次再查一遍)。
 *
 * 这些名字在库里对应的 provider 行虽然被删了,但各自是独立厂商/独立中转,
 * 归到任何现行渠道都是错的:
 *
 * | 名字 | 活跃区间 | 请求 | 主要模型 |
 * |---|---|---|---|
 * | workbuddy        | 09-14 → 10-30 | 27,975 | hy4-preview / step-5-preview / deepseek-v4.1-flash |
 * | tokenrhythm      | 08-16 → 10-29 | 18,149 | tr-alpha-channel / deepseek-flash / mimo-v2.6-flash |
 * | longcat          | 09-30 → 10-25 | 3,769  | LongCat-2.5-Preview |
 * | deepseek-official| 08-16 → 10-08 | 520    | deepseek-flash / deepseek-v4-flash |
 * | stepfun          | 10-15 → 10-16 | 66     | step-5-preview |
 * | clawbrain        | 10-26 → 10-28 | 63     | clawbrain-pro(无 token 记账) |
 */
export const REVIEWED_KEEP: readonly string[] = Object.freeze([
	"workbuddy",
	"tokenrhythm",
	"longcat",
	"deepseek-official",
	"stepfun",
	"clawbrain",
]);

/**
 * 单个名字的改写:命中表就用目标名,否则原样(只做首尾空白裁剪)。
 *
 * 空串返回空串 —— 调用方据此判断"这条记录没有供应商信息",不要当成"名字为空"。
 */
export function renameProvider(raw: string): string {
	const name = String(raw ?? "").trim();
	if (name === "") return "";
	return Object.prototype.hasOwnProperty.call(PROVIDER_RENAMES, name)
		? PROVIDER_RENAMES[name]
		: name;
}
