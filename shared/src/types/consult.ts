import { z } from 'zod';
import {
  consultListQuerySchema,
  consultOrderSchema,
  createConsultationSchema,
  inviteExpertsSchema,
} from '../schemas/consult';

/**
 * 会诊工单实体类型
 *
 * 全部由 schemas/consult 派生（S-10 单一事实源）：schema 改字段，类型自动跟随，
 * 不存在「类型与校验各写一份」的漂移点。
 *
 * 注：`ConsultStatus`（7 态）与 `ConsultFlag` 的唯一声明在 dict/consult-status、
 * dict/flags —— 它们是字典而非实体，由根出口统一导出。
 */

export type ConsultOrder = z.infer<typeof consultOrderSchema>;

/** POST /consultations 请求体（含默认值的字段在入参侧可省略） */
export type CreateConsultationRequest = z.input<typeof createConsultationSchema>;

/** POST /consultations/{id}/invite 请求体 */
export type InviteExpertsRequest = z.input<typeof inviteExpertsSchema>;

/** GET /consultations 查询参数 */
export type ConsultListQuery = z.input<typeof consultListQuerySchema>;
