import { z } from 'zod';
import {
  archiveRequestSchema,
  consultRecordSchema,
  credentialTypeSchema,
  recordOpinionSchema,
  recordVersionSchema,
  roleSchema,
  signRequestSchema,
  signatureProviderSchema,
  signatureSchema,
  signatureVerifyResultSchema,
  signerRoleSchema,
} from '../schemas/record';

/**
 * 会诊记录域实体类型（由 schemas/record 派生）
 * `SignatureVerifyStatus` 的唯一声明在 dict/signature-verify（与 ports 共用）。
 */

export type ConsultRecord = z.infer<typeof consultRecordSchema>;
export type RecordVersion = z.infer<typeof recordVersionSchema>;
export type RecordOpinion = z.infer<typeof recordOpinionSchema>;
export type RecordRole = z.infer<typeof roleSchema>;

export type Signature = z.infer<typeof signatureSchema>;
/** 签名实现形态；与 ports 的 `SignatureProvider` 接口区分命名 */
export type SignatureProviderKind = z.infer<typeof signatureProviderSchema>;
export type SignerRole = z.infer<typeof signerRoleSchema>;
export type CredentialType = z.infer<typeof credentialTypeSchema>;

/** POST /consultations/{id}/sign 请求体（3.8.4C1） */
export type SignRequest = z.infer<typeof signRequestSchema>;
/** POST /consultations/{id}/archive 请求体 */
export type ArchiveRequest = z.infer<typeof archiveRequestSchema>;
export type SignatureVerifyResult = z.infer<typeof signatureVerifyResultSchema>;
