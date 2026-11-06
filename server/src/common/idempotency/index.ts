/**
 * Idempotency-Key 去重（B-07）：同 key 同 payload 返回首次结果；同 key 异 payload → 10005。
 * 本步只定 port + 内存实现，Redis / 表实现由 B-07 决定。
 */
export interface IdempotencyRecord {
  key: string
  /** 请求体规范化后的指纹，用于判定"同 key 异 payload" */
  fingerprint: string
  response: unknown
  createdAt: number
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | undefined>
  save(record: IdempotencyRecord): Promise<void>
}

export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE')

/** 骨架占位：进程内 Map，重启即失效——仅够单实例开发用 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly rows = new Map<string, IdempotencyRecord>()

  async get(key: string): Promise<IdempotencyRecord | undefined> {
    return this.rows.get(key)
  }

  async save(record: IdempotencyRecord): Promise<void> {
    this.rows.set(record.key, record)
  }
}
