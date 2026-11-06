import { z } from 'zod';
import { ROLES } from '../authz/permissions';
import { SIGNATURE_VERIFY_STATUSES } from '../dict/signature-verify';
import { contentHashSchema, idSchema, isoDateTimeSchema } from './common';

/**
 * 会诊记录域（rec）—— 3.8.4C（签署）/ US-REC-01·02·04 / R6
 *
 * 铁律：签摘要不签正文；正文任何修订 → 新版本 → 新摘要 → 新签名（3.8.4C3）。
 */

export const roleSchema = z.enum(ROLES);
export const signatureVerifyStatusSchema = z.enum(SIGNATURE_VERIFY_STATUSES);

/** 记录版本：不可变快照，签署与验签都以它为基准 */
export const recordVersionSchema = z.object({
  id: idSchema,
  consultationId: idSchema,
  version: z.number().int().min(1),
  /** 规范化序列化后的 SHA-256 */
  contentHash: contentHashSchema,
  createdBy: idSchema,
  createdAt: isoDateTimeSchema,
});

/** 分区意见：各方只能写本人分区（US-REC-02） */
export const recordOpinionSchema = z.object({
  id: idSchema,
  recordVersionId: idSchema,
  authorId: idSchema,
  authorRole: roleSchema,
  authorOrgId: idSchema,
  section: z.string().max(64),
  content: z.string().max(5000),
  confirmedAt: isoDateTimeSchema.nullable(),
  withdrawnAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/** 结构化会诊记录（US-REC-01：参与人/时间/结论/建议强制非空） */
export const consultRecordSchema = z.object({
  id: idSchema,
  consultationId: idSchema,
  currentVersionId: idSchema,
  version: z.number().int().min(1),
  /** 参与人 */
  participantIds: z.array(idSchema).min(1),
  /** 会诊时间 */
  consultAt: isoDateTimeSchema,
  /** 结论 */
  conclusion: z.string().min(1).max(5000),
  /** 建议 / 下一步计划 */
  nextStep: z.string().min(1).max(5000),
  opinions: z.array(recordOpinionSchema),
  archivedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const SIGNATURE_PROVIDERS = ['MOCK', 'CA', 'UKEY'] as const;
export const signatureProviderSchema = z.enum(SIGNATURE_PROVIDERS);

/** 应签方：C1 明确 signerRole 取 DO / EXP */
export const SIGNER_ROLES = ['DO', 'EXP'] as const;
export const signerRoleSchema = z.enum(SIGNER_ROLES);

export const CREDENTIAL_TYPES = ['PIN', 'CA', 'MOCK'] as const;
export const credentialTypeSchema = z.enum(CREDENTIAL_TYPES);

export const signatureSchema = z.object({
  id: idSchema,
  consultationId: idSchema,
  recordVersionId: idSchema,
  contentHash: contentHashSchema,
  signerId: idSchema,
  signerRole: signerRoleSchema,
  orgId: idSchema,
  /** 签名值（服务端产出，前端只展示，不参与计算） */
  signatureValue: z.string().min(1),
  provider: signatureProviderSchema,
  /** P-04 未定期间固定 false，页面常显「演示环境，不具法律效力」 */
  legalEffect: z.boolean(),
  verifyStatus: signatureVerifyStatusSchema,
  certSerial: z.string().max(128).nullable(),
  signedAt: isoDateTimeSchema,
});

/** POST /consultations/{id}/sign（3.8.4C1） */
export const signRequestSchema = z.object({
  recordVersionId: idSchema,
  contentHash: contentHashSchema,
  signerRole: signerRoleSchema,
  credentialType: credentialTypeSchema,
  credentialProof: z.object({
    pin: z.string().max(128).optional(),
    certificate: z.string().max(4096).optional(),
    signatureValue: z.string().max(4096).optional(),
  }),
});

export const signatureVerifyResultSchema = z.object({
  verifyStatus: signatureVerifyStatusSchema,
  verifiedAt: isoDateTimeSchema,
  reason: z.string().max(200).nullable(),
});

/** POST /consultations/{id}/archive —— 服务端校验签名齐全 + 内容哈希一致 */
export const archiveRequestSchema = z.object({
  recordVersionId: idSchema,
  remark: z.string().max(500).optional(),
});
