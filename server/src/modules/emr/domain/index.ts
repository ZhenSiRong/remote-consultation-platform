/**
 * 字段级授权与共享快照的纯逻辑（架构决策.md:704）。
 * 纯 TS：不 import Nest / Prisma（规则 3），字段策略与 shared/mask-policy 同源。
 *
 * TODO(B-1x)：按 {role, scope, ticket} 判定可读字段、生成共享快照、越界告警。
 * 本步只留结构，不含真实字段策略。
 */
export interface FieldAuthzInput {
  role: string
  requestedFields: readonly string[]
  grantedFields: readonly string[]
}

export interface FieldAuthzDecision {
  allowedFields: readonly string[]
  deniedFields: readonly string[]
}

export function resolveFields(input: FieldAuthzInput): FieldAuthzDecision {
  const granted = new Set(input.grantedFields)
  return {
    allowedFields: input.requestedFields.filter((field) => granted.has(field)),
    deniedFields: input.requestedFields.filter((field) => !granted.has(field)),
  }
}
