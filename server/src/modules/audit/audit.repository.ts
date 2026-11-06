import { Injectable } from '@nestjs/common'

/**
 * 审计日志的**只读**持久化端口（架构决策.md:708「不提供写接口」）。
 * 写入只经 common/audit 的 AuditWriter；这里刻意不声明 insert / update / delete。
 * 本步是内存占位，不接数据库（audit schema 与分区表由 B-06 / B-09 落地）。
 */
export interface AuditLogRow {
  id: string
  traceId: string
  action: string
}

export interface AuditQueryFilter {
  traceId?: string
  action?: string
  from?: string
  to?: string
}

export interface AuditRepository {
  query(filter: AuditQueryFilter): Promise<readonly AuditLogRow[]>
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY')

@Injectable()
export class InMemoryAuditRepository implements AuditRepository {
  async query(_filter: AuditQueryFilter): Promise<readonly AuditLogRow[]> {
    return []
  }
}
