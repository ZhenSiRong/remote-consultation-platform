/**
 * 权限点常量唯一来源（A-10 / K-09）。
 * 契约包 `@rcp/shared` 是前后端同一份命名的事实源，本文件只做转出，
 * **禁止在本地另定义一份权限点字符串**。
 *
 * 已知缺口（有意为之，不要补）：
 * shared 的 consult 资源只有 `consult:consultation:create` 与 `consult:consultation:invite`
 * 两个权限点，**没有** list / accept / schedule / start / finish / void / archive。
 * 依据 3.6B 矩阵：「矩阵未列出的操作不得新增权限点，新增必须前后端同时提交」。
 * 因此会诊工单上「受理 / 排期 / 开始 / 结束 / 作废 / 归档」按钮的可见性
 * **由状态机决定**（`@/domain/consult/stateMachine` 的 `getAvailableActions`），
 * 不由 `can()` 决定。在这里加权限点会让前端以为后端有校验，实际没有，反而更危险。
 */
import { PERMISSIONS } from '@rcp/shared'

export * from '@rcp/shared'

/** 本切片用到的权限点（值一律引用 shared，不写字面量） */
export const CONSULT_PERMISSIONS = {
  CREATE: PERMISSIONS.CONSULTATION_CREATE,
  INVITE: PERMISSIONS.CONSULTATION_INVITE,
} as const
