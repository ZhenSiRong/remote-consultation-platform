import type { Role } from '../authz'

/**
 * 脱敏的唯一出口是响应序列化层的 MaskInterceptor（架构决策.md:827），
 * 规则来自 shared/mask-policy，与前端 domain/mask/rules.ts 同源。
 * TODO(B-11)：实现 MaskInterceptor 并按 {role, scope, ticket} 动态决定掩码级别。
 */
export type MaskLevel = 'NONE' | 'PARTIAL' | 'FULL'

export interface MaskRule {
  /** 字段路径，支持 a.b.c */
  field: string
  level: MaskLevel
}

export interface MaskContext {
  role: Role
  /** 请求声明的字段范围 */
  fields: readonly string[]
  /** 有票则可展开对应字段（R8 最小必要） */
  ticketId?: string
}

export interface MaskPort {
  apply<T>(payload: T, context: MaskContext): T
}

export const MASK_PORT = Symbol('MASK_PORT')

/** 骨架占位：原样返回。注意——占位实现等于不脱敏，B-11 前不得接入真实患者数据 */
export class PassThroughMask implements MaskPort {
  apply<T>(payload: T, _context: MaskContext): T {
    return payload
  }
}
