/**
 * 会诊工单状态机（A-04 / F1 / K-13）—— 全站唯一的流转真相。
 *
 * 7 个主态与状态字典的唯一来源是 `@rcp/shared`（dict/consult-status），本文件只做转出，
 * 不另定义第二份状态枚举；流转表也**只在这里**定义一份。
 *
 * 为什么 mock 层和页面都必须调用这里：
 * 一旦按钮可点性和 mock 的状态校验各写一份，两边迟早漂移，
 * 演示时就会出现「按钮能点但接口报 20005」这种最掉分的场景。
 *
 * 动作可见性由本文件决定，不由权限点决定：shared 里 consult 资源只有 create / invite
 * 两个权限点（见 domain/authz/permissions.ts 的说明），受理/开始/结束/作废没有权限点，
 * 所以「谁能看到什么按钮」只能靠状态机，别去补权限点。
 */
import { CONSULT_STATUS_META, type ConsultStatus } from '@rcp/shared'

export { CONSULT_STATUS, CONSULT_STATUS_META } from '@rcp/shared'
export type { ConsultStatus }

export type ConsultAction = 'ACCEPT' | 'SCHEDULE' | 'START' | 'FINISH' | 'VOID' | 'ARCHIVE'

export interface ConsultActionMeta {
  readonly code: ConsultAction
  readonly label: string
  readonly kind: 'primary' | 'default' | 'danger'
  /** 是否需要填写原因（作废必填） */
  readonly requiresReason: boolean
  /** 二次确认文案；undefined 表示不确认 */
  readonly confirmText?: string
}

/**
 * 动作元数据。
 * `confirmText` 只给不可逆动作（作废、归档）设：会诊单一旦作废或归档就回不去，
 * 一次误点就得走线下流程，确认成本远低于返工成本；其余动作可重试，不必打断操作。
 */
export const CONSULT_ACTION_META: Readonly<Record<ConsultAction, ConsultActionMeta>> = {
  ACCEPT: {
    code: 'ACCEPT',
    label: '受理',
    kind: 'primary',
    requiresReason: false,
  },
  SCHEDULE: {
    code: 'SCHEDULE',
    label: '排期',
    kind: 'primary',
    requiresReason: false,
  },
  START: {
    code: 'START',
    label: '开始会诊',
    kind: 'primary',
    requiresReason: false,
  },
  FINISH: {
    code: 'FINISH',
    label: '结束会诊',
    kind: 'primary',
    requiresReason: false,
  },
  VOID: {
    code: 'VOID',
    label: '作废',
    kind: 'danger',
    requiresReason: true,
    confirmText: '作废后不可恢复，确认作废该会诊单？',
  },
  ARCHIVE: {
    code: 'ARCHIVE',
    label: '归档',
    kind: 'default',
    requiresReason: false,
    confirmText: '归档前请确认各方已签署，确认归档？',
  },
}

/**
 * 7 态 × 动作 → 目标态；不合法则无该键。
 * 用 `Record<ConsultStatus, ...>` 强制穷举：新增状态时编译期就会报缺键，不会漏填。
 */
export const CONSULT_TRANSITIONS: Readonly<
  Record<ConsultStatus, Partial<Record<ConsultAction, ConsultStatus>>>
> = {
  PENDING_ACCEPT: {
    ACCEPT: 'ACCEPTED',
    VOID: 'VOIDED',
  },
  ACCEPTED: {
    SCHEDULE: 'SCHEDULED',
    VOID: 'VOIDED',
  },
  SCHEDULED: {
    START: 'IN_PROGRESS',
    VOID: 'VOIDED',
  },
  IN_PROGRESS: {
    FINISH: 'PENDING_SIGN',
    VOID: 'VOIDED',
  },
  PENDING_SIGN: {
    ARCHIVE: 'ARCHIVED',
    VOID: 'VOIDED',
  },
  // 终态：任何动作都非法
  ARCHIVED: {},
  VOIDED: {},
}

/**
 * 动作展示顺序：正向流程在前，作废始终排在最后。
 * 作废是破坏性动作，放在主按钮右侧/末尾，避免误点。
 */
const ACTION_ORDER: readonly ConsultAction[] = [
  'ACCEPT',
  'SCHEDULE',
  'START',
  'FINISH',
  'ARCHIVE',
  'VOID',
]

/** 合法返回目标态，非法返回 null（页面据此决定按钮是否可点） */
export function canTransition(from: ConsultStatus, action: ConsultAction): ConsultStatus | null {
  return CONSULT_TRANSITIONS[from][action] ?? null
}

/** 当前态允许的动作，按业务顺序：ACCEPT/SCHEDULE/START/FINISH/ARCHIVE 在前，VOID 在后 */
export function getAvailableActions(from: ConsultStatus): ConsultAction[] {
  const allowed = CONSULT_TRANSITIONS[from]
  return ACTION_ORDER.filter((action) => allowed[action] !== undefined)
}

/** 该状态是否终态（ARCHIVED / VOIDED）——终态判定复用 shared 字典的 terminal 字段，不另写一份 */
export function isTerminal(status: ConsultStatus): boolean {
  return CONSULT_STATUS_META[status].terminal
}
