/**
 * 工单状态机的**权威实现**（架构决策.md:703）——前端那份只用于渲染"当前可执行动作"。
 * 纯 TS：不 import Nest / Prisma（规则 3），因此可以脱离数据库单测。
 *
 * TODO(B-1x)：7 态枚举与迁移表由 shared 状态字典冻结后在此接入，
 * 同时补 R1/R2/R3/R16 四项准入校验。本步只留结构，不含业务规则。
 */
export type ConsultState = string

export interface ConsultTransition {
  from: ConsultState
  to: ConsultState
  /** 触发动作，与 shared 的动作枚举同源 */
  action: string
}

export const CONSULT_TRANSITIONS: readonly ConsultTransition[] = []

export interface TransitionCheck {
  allowed: boolean
}

export function checkTransition(from: ConsultState, to: ConsultState): TransitionCheck {
  return { allowed: CONSULT_TRANSITIONS.some((item) => item.from === from && item.to === to) }
}
