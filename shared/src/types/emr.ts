import { z } from 'zod';
import { patientBriefSchema } from '../schemas/common';
import {
  authzTicketSchema,
  authzTicketStatusSchema,
  consentMethodSchema,
  consentSchema,
  consentStatusSchema,
  emrReadQuerySchema,
  emrReadScopeSchema,
  emrRecordSchema,
  emrRecordTypeSchema,
  maskLevelSchema,
  requestAuthzTicketSchema,
  shareSnapshotSchema,
} from '../schemas/emr';

/**
 * 病历共享域实体类型（由 schemas/emr、schemas/common 派生）
 *
 * 所有带 `Masked` 后缀的字段都是**后端已脱敏**的展示值；
 * 前端不解掩码、不落盘（A-06 / 3.8.4B1）。
 */

/** 患者脱敏视图（共享内核 patientContext） */
export type PatientBrief = z.infer<typeof patientBriefSchema>;

export type EmrRecord = z.infer<typeof emrRecordSchema>;
export type EmrRecordType = z.infer<typeof emrRecordTypeSchema>;
export type MaskLevel = z.infer<typeof maskLevelSchema>;
export type EmrReadScope = z.infer<typeof emrReadScopeSchema>;

/** GET /patients/{id}/records 查询参数 */
export type EmrReadQuery = z.input<typeof emrReadQuerySchema>;

export type ShareSnapshot = z.infer<typeof shareSnapshotSchema>;

export type AuthzTicket = z.infer<typeof authzTicketSchema>;
export type AuthzTicketStatus = z.infer<typeof authzTicketStatusSchema>;
export type RequestAuthzTicket = z.input<typeof requestAuthzTicketSchema>;

/** 知情同意（R4） */
export type Consent = z.infer<typeof consentSchema>;
export type ConsentStatus = z.infer<typeof consentStatusSchema>;
export type ConsentMethod = z.infer<typeof consentMethodSchema>;
