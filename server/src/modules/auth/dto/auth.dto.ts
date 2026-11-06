/**
 * DTO = HTTP 边界类型。请求体校验用 shared/ 的 Zod schema，不在这里重复定义字段约束
 * （架构决策.md:747「Zod schema 从 shared/ 引入，不重复定义」）。
 */
export interface AuthPingDto {
  module: 'auth'
  ok: true
}
