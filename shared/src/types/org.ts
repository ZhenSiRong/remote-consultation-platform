import { z } from 'zod';
import {
  orgProtocolSchema,
  orgProtocolStatusSchema,
  orgStatusSchema,
  organizationSchema,
  physicianQualificationSchema,
} from '../schemas/org';

/**
 * 机构与协议实体类型（由 schemas/org 派生）
 * 合规主体在后端（R1 / R2 / R12 / R16），前端只消费。
 */

export type Organization = z.infer<typeof organizationSchema>;
export type OrgStatus = z.infer<typeof orgStatusSchema>;

export type OrgProtocol = z.infer<typeof orgProtocolSchema>;
export type OrgProtocolStatus = z.infer<typeof orgProtocolStatusSchema>;

export type PhysicianQualification = z.infer<typeof physicianQualificationSchema>;
