/**
 * AuditWriter 是审计的唯一写入口（架构决策.md:791）——只暴露 writeOrThrow / writeOrQueue，
 * 永不暴露 update / delete；真正的 Prisma 实现与 outbox 重试由 B-09 落地。
 *
 * TODO(B-09)：action 枚举改为 import type { AuditAction } from '@rcp/shared'，
 * 与前端 domain/audit/actions.ts 同源；本地不得新增动作名（3.8.4 A1）。
 */
export type AuditResult = 'SUCCESS' | 'DENIED' | 'ERROR'

export interface AuditEntry {
  action: string
  resourceType: string
  resourceId: string
  result: AuditResult
  patientIdMasked?: string
  scope?: Record<string, unknown>
  fields?: readonly string[]
  failReason?: string
}

export interface AuditWriter {
  /** 敏感动作：与业务同事务，写失败即抛 AuditWriteError → 整体回滚（fail-closed） */
  writeOrThrow(entry: AuditEntry): Promise<void>
  /** 非敏感动作：进 outbox，失败不阻断业务 */
  writeOrQueue(entry: AuditEntry): Promise<void>
}

export const AUDIT_WRITER = Symbol('AUDIT_WRITER')

/** 骨架占位：不写任何地方，仅保证可注入 */
export class NoopAuditWriter implements AuditWriter {
  async writeOrThrow(_entry: AuditEntry): Promise<void> {
    return Promise.resolve()
  }

  async writeOrQueue(_entry: AuditEntry): Promise<void> {
    return Promise.resolve()
  }
}
