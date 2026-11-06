import { z } from 'zod';
import { CONSULT_STATUS } from '../dict/consult-status';
import { CONSULT_FLAGS } from '../dict/flags';
import {
  dateOnlySchema,
  idSchema,
  isoDateTimeSchema,
  pageQuerySchema,
  patientBriefSchema,
} from './common';

/**
 * 会诊工单域（consult）—— 3.5A 接口清单 / 3.5F 枚举编码 / US-AV-01·02·07
 * 状态编码为 UPPER_SNAKE 字符串，与 dict/CONSULT_STATUS 同源（7 态）。
 */

export const consultStatusSchema = z.enum(CONSULT_STATUS);
export const consultFlagSchema = z.enum(CONSULT_FLAGS);

/** 工单实体（列表/详情返回） */
export const consultOrderSchema = z.object({
  id: idSchema,
  /** 业务单号，列表展示与排障用 */
  orderNo: z.string().min(1).max(32),
  /** 数据归属机构（R1 机构对机构） */
  orgId: idSchema,
  applicantOrgId: idSchema,
  /** 受邀机构；未指定时为空 */
  invitedOrgId: idSchema.nullable(),
  patient: patientBriefSchema,
  departmentName: z.string().min(1).max(64),
  /** 会诊目的 */
  consultPurpose: z.string().min(1).max(500),
  /** 主诉（US-AV-02 患者关键信息卡片） */
  chiefComplaint: z.string().max(500),
  /** 当前诊断摘要 */
  diagnosisSummary: z.string().max(1000),
  status: consultStatusSchema,
  /** 叠加标记，可多个；主态只能有一个（A-04） */
  flags: z.array(consultFlagSchema),
  scheduledAt: isoDateTimeSchema.nullable(),
  startedAt: isoDateTimeSchema.nullable(),
  endedAt: isoDateTimeSchema.nullable(),
  applicantDoctorId: idSchema,
  invitedDoctorIds: z.array(idSchema),
  createdBy: idSchema,
  /** COORD 代发起时为 true（3.6B「发起会诊」限定语） */
  createdOnBehalf: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/** POST /consultations —— 发起会诊单（校验机构准入 + 非首诊） */
export const createConsultationSchema = z.object({
  patientId: idSchema,
  invitedOrgId: idSchema,
  invitedDoctorIds: z.array(idSchema).min(1).max(20),
  departmentName: z.string().min(1).max(64),
  consultPurpose: z.string().min(1).max(500),
  chiefComplaint: z.string().max(500),
  diagnosisSummary: z.string().max(1000),
  scheduledAt: isoDateTimeSchema.nullable().optional(),
  /** 协调员代发起 */
  createdOnBehalf: z.boolean().default(false),
  /** R4：邀约前须有知情同意记录 */
  consentId: idSchema.nullable().optional(),
});

/** POST /consultations/{id}/invite —— 邀约专家（校验资质 + 知情同意） */
export const inviteExpertsSchema = z.object({
  expertIds: z.array(idSchema).min(1).max(20),
  orgId: idSchema.optional(),
  scheduledAt: isoDateTimeSchema.nullable().optional(),
  consentId: idSchema.nullable().optional(),
});

/** GET /consultations —— 业务筛选参数平铺在 query 上（3.5C） */
export const consultListQuerySchema = pageQuerySchema.extend({
  status: consultStatusSchema.optional(),
  flag: consultFlagSchema.optional(),
  patientName: z.string().max(64).optional(),
  departmentName: z.string().max(64).optional(),
  applicantOrgId: idSchema.optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
});
