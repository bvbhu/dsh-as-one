/**
 * /v1/models 的条目构建 —— 逻辑模型 + 真实模型并列(与 assembly.ts
 * listModelEntries 逐字段一致)。导入方为 src/routes.ts。
 */
export function listModelEntries(registry) {
    const entries = [];
    for (const pdef of registry.listProviders()) {
        for (const rdef of registry.listRealModels(pdef.id)) {
            entries.push({
                id: `${pdef.id}/${rdef.model}`,
                object: "model",
                owned_by: "as-one",
                litenexus_kind: "real",
                name: rdef.name ?? rdef.model,
                max_input_tokens: rdef.maxInputTokens ?? undefined,
                max_output_tokens: rdef.maxOutputTokens ?? undefined,
                supports_vision: rdef.supportsVision,
            });
        }
    }
    for (const lm of registry.listLogicalModels()) {
        entries.push({
            id: lm.name,
            object: "model",
            owned_by: "as-one",
            litenexus_kind: "logical",
            name: lm.name,
        });
    }
    return entries;
}
//# sourceMappingURL=models.js.map