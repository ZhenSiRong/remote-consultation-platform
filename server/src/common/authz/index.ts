/**
 * 权限模型（架构决策.md:527-563）：权限 = 角色 × 资源 × 操作，命名 `域:资源:动作`。
 * 权限点与票据校验由 B-10 落地为 Nest Guard；本步只定类型与 port。
 *
 * TODO(B-10)：PermissionPoint 改为 import type { PermissionPoint } from '@rcp/shared'，
 * 与前端 domain/authz/permissions.ts 同名同义；新增权限点必须两侧同时提交（3.6 D）。
 */

/** 6 类角色（3.6 A） */
export const ROLES = ['DO', 'EXP', 'PAT', 'COORD', 'IT', 'MQ'] as const
export type Role = (typeof ROLES)[number]

/** 8 类资源（3.6 B） */
export type AuthzResource =
  | 'consultation'
  | 'room'
  | 'patient_record'
  | 'record'
  | 'signature'
  | 'consent'
  | 'audit_log'
  | 'org_protocol'

/** 权限点，形如 `consult:order:create` */
export type PermissionPoint = string

export interface AuthzContext {
  actorId: string
  role: Role
  orgId: string
  /** 二次授权票据（X-Authz-Ticket），B-10 校验 */
  ticketId?: string
}

export interface AuthzPort {
  can(context: AuthzContext, point: PermissionPoint): boolean
}

export const AUTHZ_PORT = Symbol('AUTHZ_PORT')

/** 骨架占位：默认拒绝，避免"忘了接权限"变成放行 */
export class DenyAllAuthz implements AuthzPort {
  can(_context: AuthzContext, _point: PermissionPoint): boolean {
    return false
  }
}
