/**
 * 错误码外壳 + 全局异常过滤器（B-02 落地）。分段语义不可改，具体编号 B-02 / B-05 定稿：
 *   1xxxx 通用 / 参数 / 鉴权   2xxxx 越权与拦截   3xxxx 票据   4xxxx 签署与版本
 *   5xxxx 外部依赖降级        6xxxx 审计（60001 = fail-closed）   9xxxx 未捕获
 *
 * 下面这行是 B-04（shared 契约包）的联调点：后端必须能 import 一次 @rcp/shared。
 * shared/package.json 指向 dist，dist 未构建时此处会报"找不到模块"，属预期，不要删。
 */
import type { ApiResponse } from '@rcp/shared'

export const ERROR_CODE_SEGMENTS = {
  COMMON: 10000,
  AUTHZ: 20000,
  TICKET: 30000,
  SIGN: 40000,
  EXTERNAL: 50000,
  AUDIT: 60000,
  UNCAUGHT: 90000,
} as const

/** 业务失败统一 HTTP 422（传输/会话层才用 401/403/429/5xx） */
export const BUSINESS_ERROR_HTTP_STATUS = 422

export class AppError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly httpStatus: number = BUSINESS_ERROR_HTTP_STATUS,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/** 敏感动作留痕失败 → fail-closed：抛这个，业务整体回滚 */
export class AuditWriteError extends AppError {
  constructor(message = '审计写入失败，操作未执行') {
    super(60001, message)
    this.name = 'AuditWriteError'
  }
}

/** 统一响应体形状由 shared 定义，后端只做类型别名，不重复声明 */
export type ApiEnvelope<T> = ApiResponse<T>
