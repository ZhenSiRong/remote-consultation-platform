import { z } from 'zod';
import {
  auditExportFormatSchema,
  auditExportRequestSchema,
  auditLogQuerySchema,
  auditLogSchema,
} from '../schemas/audit';

/**
 * 合规审计域实体类型（由 schemas/audit 派生）
 * `AuditAction` / `AuditResult` 的声明在 dict/audit-actions（唯一来源）。
 */

export type AuditLog = z.infer<typeof auditLogSchema>;
/** GET /audit/logs 查询参数 */
export type AuditLogQuery = z.input<typeof auditLogQuerySchema>;

export type AuditExportFormat = z.infer<typeof auditExportFormatSchema>;
export type AuditExportRequest = z.input<typeof auditExportRequestSchema>;
