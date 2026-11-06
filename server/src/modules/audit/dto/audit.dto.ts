/**
 * DTO = HTTP 边界类型。查询参数校验用 shared/ 的 Zod schema，不在这里重复定义。
 */
export interface AuditPingDto {
  module: 'audit'
  ok: true
}
