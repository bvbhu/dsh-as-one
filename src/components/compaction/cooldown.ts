/**
 * 冷却算术 + 内存冷却 store（原 quilt/lib/cooldown.js；去掉 storage-domain 持久化，
 * 因为 as-one 组件不引入 DSH storage domain，冷却是进程内运行事实）。
 * @module src/components/compaction/cooldown
 */

export function computeCooldownUntil(cooldownHours: number, now: number): number {
  return now + (cooldownHours ?? 0) * 3600 * 1000;
}

export interface CooldownStore {
  cooldownUntil(key: string): number;
  isHealthy(key: string, now: number): boolean;
  applyCooldown(key: string, until: number): Promise<void>;
  clearAll(): Promise<void>;
  keys(): string[];
}

/** 进程内冷却；写按 key 串行，读写语义与 quilt 的 DomainCooldownStore 一致。 */
export class MemoryCooldownStore implements CooldownStore {
  private readonly records = new Map<string, { cooldownUntil: number }>();
  private chain: Promise<void> = Promise.resolve();

  cooldownUntil(key: string): number {
    return this.records.get(key)?.cooldownUntil ?? 0;
  }

  isHealthy(key: string, now: number): boolean {
    return this.cooldownUntil(key) <= now;
  }

  applyCooldown(key: string, until: number): Promise<void> {
    const job = this.chain.then(() => {
      if (this.records.get(key)?.cooldownUntil !== until) {
        this.records.set(key, { cooldownUntil: until });
      }
    });
    this.chain = job.then(() => undefined, () => undefined);
    return job;
  }

  clearAll(): Promise<void> {
    const job = this.chain.then(() => {
      this.records.clear();
    });
    this.chain = job.then(() => undefined, () => undefined);
    return job;
  }

  keys(): string[] {
    return [...this.records.keys()];
  }
}
