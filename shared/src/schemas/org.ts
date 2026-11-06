import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common';

/**
 * 机构与协议（org）—— R1 / R12 / R16 / US-COL-04
 *
 * 六域之外的合规主体：权限资源 `org_protocol` 与准入校验（20001 / 20002 / 20004）都以它为依据。
 * 权威数据在后端 `modules/org`，前端只消费（3.8.3）。
 */

export const ORG_STATUSES = ['ACTIVE', 'SUSPENDED', 'PENDING'] as const;
export const orgStatusSchema = z.enum(ORG_STATUSES);

export const organizationSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(128),
  /** 机构唯一编码（实名接入凭证） */
  orgCode: z.string().min(1).max(64),
  status: orgStatusSchema,
  /** 获批执业科目；超范围科目不可选（R16 / 20004） */
  approvedDepartments: z.array(z.string().max(64)),
  createdAt: isoDateTimeSchema,
});

export const ORG_PROTOCOL_STATUSES = ['PENDING', 'SIGNED', 'EXPIRED', 'TERMINATED'] as const;
export const orgProtocolStatusSchema = z.enum(ORG_PROTOCOL_STATUSES);

/** 《远程医疗服务协议》：机构对机构的合规基础（R1 / R12） */
export const orgProtocolSchema = z.object({
  id: idSchema,
  orgAId: idSchema,
  orgBId: idSchema,
  status: orgProtocolStatusSchema,
  signedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  /** 责任划分（可配置、可审计） */
  responsibility: z.string().max(2000),
  /** 协议电子件 */
  attachmentId: idSchema.nullable(),
  signedByA: idSchema.nullable(),
  signedByB: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/** 医师资质：执业范围、主诊年限（≥3 年）、有效期（R2） */
export const physicianQualificationSchema = z.object({
  id: idSchema,
  doctorId: idSchema,
  doctorName: z.string().min(1).max(64),
  orgId: idSchema,
  departmentName: z.string().max(64),
  /** 执业范围（科目） */
  practiceScope: z.array(z.string().max(64)),
  title: z.string().max(64),
  /** 独立临床年限；互联网诊疗主诊医师须 ≥3 年 */
  independentYears: z.number().int().min(0),
  validFrom: isoDateTimeSchema,
  validTo: isoDateTimeSchema,
  /** 是否已通过实名核验（US-AV-05） */
  verified: z.boolean(),
});
