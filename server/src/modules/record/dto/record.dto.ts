/**
 * DTO = HTTP 边界类型。请求体校验用 shared/ 的 Zod schema，不在这里重复定义字段约束。
 */
export interface RecordPingDto {
  module: 'record'
  ok: true
}
