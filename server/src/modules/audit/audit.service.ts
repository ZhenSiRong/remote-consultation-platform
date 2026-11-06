import { Injectable } from '@nestjs/common'

import type { AuditPingDto } from './dto/audit.dto'

/**
 * 审计查询与导出（只读）。导出属敏感动作：需 AUDIT_EXPORT 留痕（fail-closed）。
 * 本模块**不提供任何写接口**，写入只在 common/audit 的 AuditWriter。
 */
@Injectable()
export class AuditService {
  ping(): AuditPingDto {
    return { module: 'audit', ok: true }
  }
}
