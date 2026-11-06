import axios, { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import {
  ERROR_CODES,
  getErrorCodeMeta,
  getErrorSegment,
  isErrorCode,
  type ApiResponse,
  type ErrorCode,
} from '@rcp/shared'
import { mockAdapter, mockEnabled } from '@/mock'

/**
 * 请求层（A-07/A-09 / K-04）。
 *
 * 三件事：
 * 1. 每次请求生成 traceId 并写 `X-Trace-Id`，后端回填后与留痕共用同一 ID；
 * 2. 统一解包 `ApiResponse`：code=0 只把 data 交给页面，code≠0 抛 ApiError；
 * 3. HTTP 层错误（401/403/429/5xx/断网）也收敛成 ApiError，页面只需 catch 一种类型。
 *
 * 为什么错误统一成 ApiError 而不是让页面分辨 axios error / 业务错误：
 * 页面真正关心的是「提示什么、要不要阻断、traceId 多少」，不是错误来自哪一层。
 */

const TRACE_ID_HEADER = 'X-Trace-Id'

/** 无响应（断网/超时/DNS 失败）对用户是同一件事，提示语不细分 */
const NETWORK_ERROR_MESSAGE = '网络异常，请检查连接'

/**
 * 业务错误：code ≠ 0 时抛出，页面按 code 分支处理。
 * code 取值见 `@rcp/shared` 的 ERROR_CODES，本文件不另定义错误码常量。
 */
export class ApiError extends Error {
  readonly code: number
  readonly traceId: string

  constructor(code: number, message: string, traceId: string) {
    super(message)
    // 继承内置 Error 后 name 仍为 'Error'，显式改掉才能和运行时异常区分开
    this.name = 'ApiError'
    this.code = code
    this.traceId = traceId
  }

  /** code 是否落在会诊工单段（2xxxx） */
  get isConsult(): boolean {
    return getErrorSegment(this.code) === 'CONSULT'
  }
}

/**
 * traceId：契约要求 16–32 位十六进制，UUID 去掉连字符正好 32 位。
 * randomUUID 只在安全上下文可用（内网 http 演示地址下不存在），此时退回 Math.random：
 * traceId 仅用于串联日志，不承担安全职责。
 */
function createTraceId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) {
    return uuid.replace(/-/g, '')
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function readHeaderTraceId(config: InternalAxiosRequestConfig | undefined): string {
  const value = config?.headers?.[TRACE_ID_HEADER]
  return typeof value === 'string' ? value : ''
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return typeof (value as Partial<ApiResponse<unknown>> | null)?.code === 'number'
}

function logApi(config: InternalAxiosRequestConfig | undefined, code: number, traceId: string): void {
  if (!import.meta.env.DEV) {
    return
  }
  const method = (config?.method ?? 'get').toUpperCase()
  console.debug(`[api] ${method} ${config?.url ?? ''} code=${code} traceId=${traceId}`)
}

/**
 * 解包统一响应体。
 * traceId 优先取响应体（后端回填），缺失时回落到请求头里前端生成的那个，
 * 保证「前端日志里的 traceId」和「后端留痕里的 traceId」始终能对上。
 */
function unwrap(response: AxiosResponse): unknown {
  const requestTraceId = readHeaderTraceId(response.config)
  const body = response.data

  // 非统一响应体（文件流、第三方回调等）原样返回，不强行按契约解包
  if (!isApiResponse(body)) {
    logApi(response.config, ERROR_CODES.SUCCESS, requestTraceId)
    return body
  }

  const traceId = body.traceId || requestTraceId
  logApi(response.config, body.code, traceId)

  if (body.code !== ERROR_CODES.SUCCESS) {
    const fallbackMessage = isErrorCode(body.code) ? getErrorCodeMeta(body.code).message : '请求失败'
    throw new ApiError(body.code, body.message || fallbackMessage, traceId)
  }

  return body.data
}

/** 传输层状态码 → 业务码；5xx 与未识别的状态码一律归为系统错误 */
function mapHttpStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return ERROR_CODES.UNAUTHENTICATED
    case 403:
      return ERROR_CODES.FORBIDDEN
    case 429:
      return ERROR_CODES.RATE_LIMITED
    default:
      return ERROR_CODES.INTERNAL_ERROR
  }
}

/**
 * 失败分支统一收敛。
 * 顺序很重要：先看响应体里有没有业务 code（业务失败走 HTTP 422，axios 同样会 reject），
 * 只有拿不到业务 code 时才按 HTTP 状态码兜底，否则会把 401 携带的业务语义丢掉。
 */
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error
  }

  if (!axios.isAxiosError(error)) {
    return new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      getErrorCodeMeta(ERROR_CODES.INTERNAL_ERROR).message,
      createTraceId(),
    )
  }

  const requestTraceId = readHeaderTraceId(error.config)
  const response = error.response

  if (!response) {
    logApi(error.config, ERROR_CODES.INTERNAL_ERROR, requestTraceId)
    return new ApiError(ERROR_CODES.INTERNAL_ERROR, NETWORK_ERROR_MESSAGE, requestTraceId)
  }

  const body = response.data
  if (isApiResponse(body)) {
    const traceId = body.traceId || requestTraceId
    logApi(response.config, body.code, traceId)
    const fallbackMessage = isErrorCode(body.code) ? getErrorCodeMeta(body.code).message : '请求失败'
    return new ApiError(body.code, body.message || fallbackMessage, traceId)
  }

  const code = mapHttpStatus(response.status)
  logApi(response.config, code, requestTraceId)
  return new ApiError(code, getErrorCodeMeta(code).message, requestTraceId)
}

export const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 15_000,
})

/**
 * 演示切片（K-06）：mock 开启时用契约级 adapter 顶替网络层。
 * 为什么放在这里而不是 api/consult.ts：adapter 是「传输实现」，与「调哪个接口」无关；
 * 挂在实例上，6 个 api 函数、拦截器、traceId 全部照常走，页面感知不到 mock 的存在。
 * 接真后端时把 VITE_USE_MOCK 置为 'false'，这两行自动失效，业务代码零改动。
 */
if (mockEnabled) {
  request.defaults.adapter = mockAdapter
}

request.interceptors.request.use((config) => {
  config.headers.set(TRACE_ID_HEADER, createTraceId())
  return config
})

request.interceptors.response.use(
  // 拦截器已把 data 解包成业务对象，类型上仍须声明成 AxiosResponse：
  // axios 的类型签名不接受别的返回值，真正的返回类型由 httpGet/httpPost 的泛型兜住。
  (response) => unwrap(response) as unknown as AxiosResponse,
  (error: unknown) => Promise.reject(toApiError(error)),
)

/**
 * GET：返回值即 `ApiResponse.data`，失败抛 ApiError。
 * 断言是必要的：响应拦截器已把 AxiosResponse 解包成业务对象，
 * 但 axios 的类型签名（1.x 的 AxiosResponseResult 条件类型）无法表达这一点。
 */
export function httpGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return request.get(url, { params }) as unknown as Promise<T>
}

/** POST：返回值即 `ApiResponse.data`，失败抛 ApiError（断言理由同 httpGet） */
export function httpPost<T>(url: string, body?: unknown): Promise<T> {
  return request.post(url, body) as unknown as Promise<T>
}

export default request
