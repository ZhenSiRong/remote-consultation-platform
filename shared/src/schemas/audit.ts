import { z } from 'zod';
import { ROLES } from '../authz/permissions';
import { AUDIT_ACTIONS, AUDIT_RESULTS } from '../dict/audit-actions';
import { dateOnlySchema, idSchema, isoDateTimeSchema, pageQuerySchema } from './common';

/**
 * 合规审计域（audit）—— 3.8.4A1（表结构）/ 3.7A（必留痕动作）/ US-EMR-04
 *
 * 只读查询 + 导出；**不提供写接口**（3.8.3）。日志仅追加，任何编辑/删除入口都不存在。
 */

export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export const auditResultSchema = z.enum(AUDIT_RESULTS);

export const auditLogSchema = z.object({
  /** 对外不透明标识（非数据库 bigserial，物理顺序不暴露） */
  id: idSchema,
  traceId: z.string().min(16).max(32),
  /** 服务端时钟，不接受客户端时间 */
  ts: isoDateTimeSchema,
  actorId: idSchema,
  actorRole: z.enum(ROLES),
  orgId: idSchema,
  action: auditActionSchema,
  resourceType: z.string().min(1).max(48),
  resourceId: idSchema,
  /** 脱敏后的患者标识 —— 审计表本身不得成为泄露源 */
  patientIdMasked: z.string().max(64).nullable(),
  /** 授权范围与字段清单（EMR_READ / MASK_REVEAL 必填） */
  scope: z.array(z.string().max(64)),
  fields: z.array(z.string().max(64)),
  result: auditResultSchema,
  /** 拦截类必填，对应 2xxxx 分段码 */
  failReason: z.string().max(64).nullable(),
  ip: z.string().max(64),
  userAgent: z.string().max(512),
  /** 链式哈希：row_hash = sha256(prev_hash ‖ 规范化(本行)) */
  prevHash: z.string().length(64),
  rowHash: z.string().length(64),
});

/** GET /audit/logs?from=&to=&actor= */
export const auditLogQuerySchema = pageQuerySchema.extend({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  actorId: idSchema.optional(),
  action: auditActionSchema.optional(),
  result: auditResultSchema.optional(),
  resourceType: z.string().max(48).optional(),
  resourceId: idSchema.optional(),
  traceId: z.string().max(32).optional(),
  orgId: idSchema.optional(),
});

export const AUDIT_EXPORT_FORMATS = ['CSV', 'XLSX'] as const;
export const auditExportFormatSchema = z.enum(AUDIT_EXPORT_FORMATS);

/** 导出审计日志：导出动作本身留痕 AUDIT_EXPORT（敏感动作，fail-closed） */
export const auditExportRequestSchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  actorId: idSchema.optional(),
  action: auditActionSchema.optional(),
  format: auditExportFormatSchema.default('CSV'),
});
