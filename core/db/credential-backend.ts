/**
 * 数据库凭据后端 —— ``credential`` 表作为凭据的唯一真源。
 *
 * ## 为什么
 *
 * 阶段一凭据只活在 ``as-one.credentials.json`` 里,而 ``credential`` 表
 * 一直是空的(schema 齐全但没人写)。用户裁定(m28134 / m28051):
 * **数据库是唯一真源**,JSON 退化为导入 / 导出 / 备份格式。于是
 * ``CredentialVault`` 的后端从「文件」换成「表」,上层面板 / 连接器 /
 * 探测逻辑一行都不用改 —— 它们只认 ``CredentialBackend`` 接口。
 *
 * ## 依赖方向
 *
 * 与 ``registry-projection.ts`` 同向(db → config):本文件 import
 * ``CredentialBackend`` / ``StoredCredential`` 契约,反过来 config 层
 * 不认识 db。装配层负责把两边接起来。
 *
 * ## 写语义
 *
 * - 表里 ``raw_json`` 是 **JSON 字符串**(与 Nexus DB 列语义一致,
 *   ``toStored`` 也这么落盘);本后端读写时原样搬运,不做二次编码;
 * - 写入用 ``INSERT ... ON CONFLICT DO UPDATE``(即 ``credential.insert``
 *   的 upsert 语义),避免「先查后写」的竞态;
 * - ``onChange`` **不实现**:表是本进程独占写的(单实例锁保证),没有
 *   外部编辑器改库的场景,推送事件只会在自己的写路径上自我回环。
 */

import type { NexusDatabase } from "./database.js";
import type { CredentialBackend, CredentialEvent, StoredCredential } from "../config/credentials.js";

/** ``credential`` 行 → ``StoredCredential``(列名逐字对应,snake_case)。 */
function rowToStored(row: {
  provider: string;
  username: string;
  secret: string | null;
  refresh_secret: string | null;
  expires_at: number | null;
  raw_json: string | null;
}): StoredCredential {
  const out: StoredCredential = {
    provider: row.provider,
    username: row.username,
    secret: row.secret ?? null,
    refresh_secret: row.refresh_secret ?? null,
    expires_at: row.expires_at ?? null,
  };
  if (row.raw_json !== null) out.raw_json = row.raw_json;
  return out;
}

/** ``StoredCredential`` → 表列(缺字段按 NULL)。 */
function storedToRow(record: StoredCredential): {
  provider: string;
  username: string;
  secret: string | null;
  refresh_secret: string | null;
  expires_at: number | null;
  raw_json: string | null;
} {
  // ``StoredCredential.raw_json`` 声明成 ``unknown``(文件后端直接落对象),
  // 而表列是 **JSON 字符串**(Nexus DB 语义)。这里统一收敛:
  // 已是字符串就原样,否则序列化;``null``/``undefined`` → NULL。
  let rawJson: string | null = null;
  if (typeof record.raw_json === "string") rawJson = record.raw_json;
  else if (record.raw_json !== null && record.raw_json !== undefined) rawJson = JSON.stringify(record.raw_json);
  return {
    provider: record.provider,
    username: record.username,
    secret: record.secret ?? null,
    refresh_secret: record.refresh_secret ?? null,
    expires_at: record.expires_at ?? null,
    raw_json: rawJson,
  };
}

/**
 * 表驱动的凭据后端。
 *
 * 所有方法都是同步 SQLite 调用的 ``Promise`` 包装 —— ``CredentialVault``
 * 的接口是异步的,而 ``node:sqlite`` 的 ``DatabaseSync`` 是同步 API
 * (桌面端单进程、单写者,同步更简单且不会引入队列延迟)。
 */
export class DbCredentialBackend implements CredentialBackend {
  readonly name = "db";
  readonly writable = true;
  private readonly listeners = new Set<(events: CredentialEvent[]) => void>();

  constructor(private readonly db: NexusDatabase) {}

  onChange(listener: (events: CredentialEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async list(): Promise<StoredCredential[]> {
    return this.db.credential.list().map(rowToStored);
  }

  async get(provider: string, username: string): Promise<StoredCredential | null> {
    const row = this.db.credential.get(provider, username);
    return row ? rowToStored(row) : null;
  }

  async put(record: StoredCredential): Promise<void> {
    // upsert:凭据的写路径天然是「覆盖已有行」(保存 / 轮换 / 迁移补密钥),
    // 纯 INSERT 会撞 UNIQUE(provider, username)。
    this.db.credential.set(storedToRow(record));
  }

  async remove(provider: string, username: string): Promise<boolean> {
    // 先判存在再删:``delete`` 的返回值语义在 Nexus 侧是「删了几行」,
    // 而 vault 要的是「原来有没有」。
    if (!this.db.credential.get(provider, username)) return false;
    this.db.credential.delete(provider, username);
    return true;
  }

  private emit(events: CredentialEvent[]): void {
    for (const listener of [...this.listeners]) listener(events);
  }
}
