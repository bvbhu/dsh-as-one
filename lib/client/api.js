/**
 * client 半 —— 面板数据层:把共享视图层的 invoke 桥接到宿主的 HTTP 路由。
 *
 * 共享页面(`@as-one/panel-ui`)只调 `invokePanel(method, ...args)`;这里在
 * 面板挂载前注入实现:`POST as-one/api/<method>`,body `{ args: [...] }`
 * (宿主半 src/panel-routes.ts 的 argsOf 接受该形状,也兼容裸数组与旧对象)。
 *
 * wire 形状:成功 `{ ok: true, value: T }`、失败 `{ ok: false, error: { code, message } }`;
 * 失败/网络/坏响应统一抛 AsOneApiError(code, message)。零 Node 类型。
 */
import { setPanelInvoker } from "@as-one/panel-ui";
export class AsOneApiError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "AsOneApiError";
        this.code = code;
    }
}
/** 文档相对 URL(绝不 root-absolute),与宿主半的 exact 路由一一对应。 */
async function post(method, args) {
    let res;
    try {
        res = await fetch(`as-one/api/${method}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ args }),
        });
    }
    catch {
        throw new AsOneApiError("network", "请求失败(网络错误)");
    }
    let json;
    try {
        json = await res.json();
    }
    catch {
        throw new AsOneApiError("bad-response", `响应不是合法 JSON(HTTP ${res.status})`);
    }
    const wire = json;
    if (wire !== null && typeof wire === "object" && "ok" in wire) {
        if (wire.ok)
            return wire.value;
        const failure = wire;
        throw new AsOneApiError(failure.error?.code ?? "error", failure.error?.message ?? "As One API 错误");
    }
    return json;
}
/**
 * 把共享视图层的数据通道接到本面板的 HTTP 路由。
 * 幂等:面板重新挂载时重复调用即可。
 */
export function bindPanelBridge() {
    setPanelInvoker((method, ...args) => post(method, args));
}
//# sourceMappingURL=api.js.map