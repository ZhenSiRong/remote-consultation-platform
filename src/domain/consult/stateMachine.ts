/**
 * 会诊工单状态机（A-04 / F1 / K-13）。
 * 7 个主态与状态字典的唯一来源是 `@rcp/shared`（dict/consult-status），本文件只做转出，
 * 不另定义第二份状态枚举。
 * TODO(K-13)：补"当前态 + 动作 → 目标态 + 所需权限 + 所需留痕"流转表与"当前态可执行动作"查询。
 */
export { CONSULT_STATUS, CONSULT_STATUS_META } from '@rcp/shared'
export type { ConsultStatus } from '@rcp/shared'
