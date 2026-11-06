import { z } from 'zod';
import { idSchema, isoDateTimeSchema, dateOnlySchema } from './common';

/**
 * 病历共享域（emr）—— 3.5A（`GET /patients/{id}/records?scope=&fields=&ttl=`）/ R8 / US-EMR-01～05
 *
 * 脱敏的唯一位置是后端响应序列化层（3.8.4B1）；前端只渲染 maskLevel 对应的占位，
 * **不解掩码、不落盘**（A-06）。
 */

export const MASK_LEVELS = ['NONE', 'PARTIAL', 'FULL'] as const;
export const maskLevelSchema = z.enum(MASK_LEVELS);

export const EMR_RECORD_TYPES = ['OUTPATIENT', 'INPATIENT', 'LAB', 'EXAM', 'IMAGING'] as const;
export const emrRecordTypeSchema = z.enum(EMR_RECORD_TYPES);

/** 授权范围（最小必要） */
export const EMR_READ_SCOPES = ['SUMMARY', 'VISIT_RANGE', 'FULL'] as const;
export const emrReadScopeSchema = z.enum(EMR_READ_SCOPES);

export const emrRecordSchema = z.object({
  id: idSchema,
  patientId: idSchema,
  orgId: idSchema,
  recordType: emrRecordTypeSchema,
  title: z.string().min(1).max(200),
  /** 住院号/病历号，默认后 4 位可见 */
  visitNoMasked: z.string().max(64).nullable(),
  departmentName: z.string().max(64).nullable(),
  /** 诊疗发生时间（时间轴排序依据） */
  occurredAt: isoDateTimeSchema,
  /** 列表页只展示摘要 */
  summary: z.string().max(1000),
  maskLevel: maskLevelSchema,
  /** 本行被脱敏的字段名清单，供 MaskedText 渲染锁图标 */
  maskedFields: z.array(z.string().max(64)),
  /** 已纳入某次会诊的共享快照 */
  sharedInConsultationId: idSchema.nullable(),
});

/** 调阅请求：scope 定授权范围，fields 定字段范围，ttl 定有效期 */
export const emrReadQuerySchema = z.object({
  scope: emrReadScopeSchema.default('SUMMARY'),
  fields: z.array(z.string().max(64)).optional(),
  ttlSeconds: z.number().int().min(60).max(14400).default(1800),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
});

/** 共享快照：随记录归档（US-EMR-02） */
export const shareSnapshotSchema = z.object({
  id: idSchema,
  consultationId: idSchema,
  patientId: idSchema,
  /** 选定的病历区间 */
  dateFrom: dateOnlySchema,
  dateTo: dateOnlySchema,
  recordTypes: z.array(emrRecordTypeSchema),
  recordIds: z.array(idSchema),
  /** 快照内容哈希，供签署与验签引用 */
  contentHash: z.string().min(1),
  version: z.number().int().min(1),
  createdBy: idSchema,
  createdAt: isoDateTimeSchema,
});

/** 二次授权票据（X-Authz-Ticket）：opaque token，可即时吊销（3.8.4B2） */
export const AUTHZ_TICKET_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export const authzTicketStatusSchema = z.enum(AUTHZ_TICKET_STATUSES);

export const authzTicketSchema = z.object({
  id: idSchema,
  actorId: idSchema,
  orgId: idSchema,
  patientId: idSchema,
  /** 允许展开的字段清单 */
  fields: z.array(z.string().max(64)),
  scope: emrReadScopeSchema,
  sessionId: idSchema,
  grantedBy: idSchema,
  reason: z.string().max(200),
  issuedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable(),
  status: authzTicketStatusSchema,
});

/** POST /authz/tickets —— 申请二次授权 */
export const requestAuthzTicketSchema = z.object({
  patientId: idSchema,
  sessionId: idSchema,
  fields: z.array(z.string().max(64)).min(1),
  scope: emrReadScopeSchema,
  reason: z.string().min(1).max(200),
  ttlSeconds: z.number().int().min(60).max(14400).default(1800),
});

/** 知情同意（R4；本期机构端代录，可撤回 —— P-05 / E-08） */
export const CONSENT_STATUSES = ['PENDING', 'SIGNED', 'WITHDRAWN'] as const;
export const consentStatusSchema = z.enum(CONSENT_STATUSES);

export const CONSENT_METHODS = ['ORG_ENTRY', 'PATIENT_ONLINE'] as const;
export const consentMethodSchema = z.enum(CONSENT_METHODS);

export const consentSchema = z.object({
  id: idSchema,
  consultationId: idSchema,
  patientId: idSchema,
  status: consentStatusSchema,
  method: consentMethodSchema,
  signedAt: isoDateTimeSchema.nullable(),
  withdrawnAt: isoDateTimeSchema.nullable(),
  /** 患者签字件（扫描/拍照）对象存储引用 */
  attachmentId: idSchema.nullable(),
  recordedBy: idSchema,
  createdAt: isoDateTimeSchema,
});
