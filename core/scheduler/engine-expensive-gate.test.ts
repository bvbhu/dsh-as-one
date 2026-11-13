/**
 * `chain()` 里的高消耗模型闸门(2026-11-10 用户定案)的**集成**验证。
 *
 * 前面 `expensive-models.test.ts` 只测了纯判定函数;这里测**真的穿过 chain()**:
 * 当某账号的 5h 窗口剩余比例低于阈值时,`sensenova/glm-5.3` 的端点必须
 * **从链里消失**,而同账号的 `sensenova/deepseek-flash` 必须还在。
 */
import { describe, expect, it } from "vitest";

import { InMemoryRepo, Scheduler } from "./engine.js";
import type { RawEndpointRow } from "./types.js";

/** 0-based 时间(秒),周中某天 03:00。 */
function at(hour = 3, day = 7): number {
  return new Date(2026, 10, day, hour, 0, 0, 0).getTime() / 1000;
}

/** 造一条端点行(凭据名给 username)。 */
function row(provider: string, model: string, username: string): RawEndpointRow {
  return {
    member: { provider, model },
    endpoint: {
      provider_id: provider,
      upstream_id: model,
      credential_key: [provider, username],
      concurrency: 1,
      supports_vision: true,
    },
  };
}

/** 建一个逻辑模型,成员 = 传入的 [provider, model] 列表。 */
function seed(models: Array<[string, string]>, username: string): InMemoryRepo {
  const repo = new InMemoryRepo();
  repo.setLogicalModel("sn", { strategy: "due-first" });
  repo.setMembers("sn", models.map(([p, m]) => ({ provider: p, model: m })));
  repo.setChain("sn", models.map(([p, m]) => row(p, m, username)));
  return repo;
}

const MODELS: Array<[string, string]> = [
  ["sensenova", "glm-5.3"],
  ["sensenova", "deepseek-flash"],
];

/** 取 chain 里保留下来的 `provider/model` 列表。 */
function chainModels(sched: Scheduler, now: number): string[] {
  return sched
    .chain("sn", { now, force: true })
    .map((it) => `${it.endpoint.provider}/${it.endpoint.model}`);
}

describe("chain() 高消耗模型闸门", () => {
  it("5h 窗口剩 0%(buhhuv 实测现状)→ glm-5.3 被剔除,deepseek-flash 保留", () => {
    const repo = seed(MODELS, "buhhuv");
    // 该账号的通用池 5h 已打满
    repo.setQuota("sensenova/buhhuv", { w5_ratio: 0, w7_ratio: 0.57 });
    const models = chainModels(new Scheduler(repo), at());
    expect(models).not.toContain("sensenova/glm-5.3");
    expect(models).toContain("sensenova/deepseek-flash");
  });

  it("5h 剩 5%(低于 10%)→ glm 剔除", () => {
    const repo = seed(MODELS, "hubhuv");
    repo.setQuota("sensenova/hubhuv", { w5_ratio: 0.05, w7_ratio: 0.8 });
    const models = chainModels(new Scheduler(repo), at());
    expect(models).not.toContain("sensenova/glm-5.3");
    expect(models).toContain("sensenova/deepseek-flash");
  });

  it("5h 剩 83%(实测 hubhuv)→ glm 保留(额度健康时照常可跑)", () => {
    const repo = seed(MODELS, "hubhuv");
    repo.setQuota("sensenova/hubhuv", { w5_ratio: 0.83, w7_ratio: 0.81 });
    const models = chainModels(new Scheduler(repo), at());
    expect(models).toContain("sensenova/glm-5.3");
    expect(models).toContain("sensenova/deepseek-flash");
  });

  it("周窗只剩 10%(5h 刚重置)→ glm 剔除(周窗单独判)", () => {
    const repo = seed(MODELS, "huvhub");
    repo.setQuota("sensenova/huvhub", { w5_ratio: 1, w7_ratio: 0.1 });
    const models = chainModels(new Scheduler(repo), at());
    expect(models).not.toContain("sensenova/glm-5.3");
  });

  it("没有额度数据(null 比例)→ 放行(fail-open,别锁死链路)", () => {
    const repo = seed(MODELS, "hubhuv");
    // 一条 quota 都不喂 → 比例读不到
    const models = chainModels(new Scheduler(repo), at());
    expect(models).toContain("sensenova/glm-5.3");
    expect(models).toContain("sensenova/deepseek-flash");
  });

  it("provider 级回落:凭据级没数据时读 `sensenova` 这一行", () => {
    const repo = seed(MODELS, "buhhuv");
    // 只喂 provider 级聚合(没有 sensenova/buhhuv 这行)
    repo.setQuota("sensenova", { w5_ratio: 0, w7_ratio: 0.5 });
    const models = chainModels(new Scheduler(repo), at());
    expect(models).not.toContain("sensenova/glm-5.3");
  });

  it("便宜模型完全不受闸门影响(即便 5h 归零)", () => {
    const repo = seed([["sensenova", "deepseek-flash"]], "buhhuv");
    repo.setQuota("sensenova/buhhuv", { w5_ratio: 0, w7_ratio: 0.2 });
    const models = chainModels(new Scheduler(repo), at());
    expect(models).toContain("sensenova/deepseek-flash");
  });
});
