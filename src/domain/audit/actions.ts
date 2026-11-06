/**
 * 留痕动作枚举（R9 / K-08）。
 * 唯一来源是 `@rcp/shared`（dict/audit-actions，17 个动作），本文件只做转出；
 * 上报器只接受该枚举内的动作，未声明动作不允许调用留痕接口。
 * TODO(K-08)：实现 fail-closed 上报器（敏感动作留痕失败即阻断业务）。
 */
export { AUDIT_ACTIONS } from '@rcp/shared'
export type { AuditAction } from '@rcp/shared'
