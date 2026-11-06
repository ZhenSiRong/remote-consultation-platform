/**
 * 统一响应体 —— A-07 / 架构决策.md 3.5B
 *
 * 约定：
 * - `code = 0` 为成功，非 0 一律走错误分支（错误码见 errors/）。
 * - HTTP 状态码只承载传输与会话层语义（401/403/429/5xx），
 *   业务规则失败统一 HTTP 422 + `code` 细分。
 * - `traceId` 由前端生成并随 `X-Trace-Id` 透传，后端回填；留痕与排障共用同一 ID。
 * - `timestamp` 为 ISO 8601 带时区字符串（展示层再转本地时区）。
 */
export const API_SUCCESS_CODE = 0;

export interface ApiResponse<T = unknown> {
  /** 0 = 成功；非 0 见 errors/ERROR_CODES */
  code: number;
  /** 面向用户的提示语；成功固定 "ok" */
  message: string;
  data: T;
  /** 16–32 位十六进制 */
  traceId: string;
  /** ISO 8601 带时区 */
  timestamp: string;
}

export function isApiSuccess<T>(response: Pick<ApiResponse<T>, 'code'>): boolean {
  return response.code === API_SUCCESS_CODE;
}
