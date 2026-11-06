import {
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ERROR_CODES, type ApiResponse } from '@rcp/shared'

/**
 * 契约级 Mock 适配器（A1 / K-06）。
 *
 * 为什么用 axios adapter 而不是 vite 插件拦截 / MSW：
 * 业务代码调的是 `request`（src/api/request.ts）这一个 axios 实例，
 * 把 adapter 挂在实例上，请求仍然走完整的 axios 链路（拦截器、解包、超时、取消），
 * 页面拿到的错误对象也仍然是 `ApiError`。接真后端时只需换掉 adapter，
 * 请求层、业务层、页面一行不用改——这就是「两段式」的接缝。
 *
 * 响应形状的硬约束（违反就等于给自己造第二套契约）：
 * - HTTP 状态恒为 200：业务失败靠 `code` 区分（契约 3.5B，HTTP 语义只承载会话层）。
 *   若这里按 422 返回，axios 会走 reject 分支，request.ts 的解包逻辑就跑不到了。
 * - 响应体永远是 `ApiResponse`：`{ code, message, data, traceId, timestamp }`。
 */

export interface MockContext {
  method: 'GET' | 'POST'
  /** 去掉 /api 前缀和 query 后的路径，如 '/consultations/abc/transition' */
  path: string
  /** query 参数（已 string 化） */
  query: Record<string, string>
  /** JSON body */
  body: unknown
}

export interface MockReply {
  /** 0 = 成功；非 0 见 @rcp/shared 的 ERROR_CODES */
  code: number
  message: string
  data: unknown
}

export type MockHandler = (ctx: MockContext) => MockReply | Promise<MockReply>

export interface MockRoute {
  method: 'GET' | 'POST'
  /** 支持 ':id' 占位，如 '/consultations/:id/transition' */
  pattern: string
  handler: MockHandler
}

const API_PREFIX = '/api'
const TRACE_ID_HEADER = 'X-Trace-Id'

/** 模拟延迟下限/浮动区间：太短看不见 loading 态，太长演示节奏拖沓 */
const DELAY_MIN_MS = 80
const DELAY_RANGE_MS = 120

/**
 * traceId：契约要求 16–32 位十六进制，UUID 去掉连字符正好 32 位。
 * randomUUID 只在安全上下文可用，退回 Math.random——traceId 只用于串联日志，不承担安全职责。
 * 与 request.ts 的生成规则保持一致，否则两边日志对不上。
 */
function createTraceId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) {
    return uuid.replace(/-/g, '')
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

/** 优先复用请求头里前端已生成的 traceId，保证「请求日志」与「响应体」是同一个 ID */
function readTraceId(config: InternalAxiosRequestConfig): string {
  const value = config.headers?.get?.(TRACE_ID_HEADER)
  return typeof value === 'string' && value.length > 0 ? value : createTraceId()
}

/**
 * 去掉 baseURL、query 与末尾斜杠，得到路由表使用的纯路径。
 * query 不在这里解析：axios 1.x 在 adapter 之前不会把 params 拼进 url，
 * 两种来源（url 上的 ?a=b、config.params）都要在 toQuery 里合并。
 */
function resolvePath(config: InternalAxiosRequestConfig): string {
  const raw = config.url ?? '/'
  const queryIndex = raw.indexOf('?')
  let path = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw

  const baseURL = config.baseURL ?? ''
  if (baseURL && path.startsWith(baseURL)) {
    path = path.slice(baseURL.length)
  } else if (path.startsWith(API_PREFIX)) {
    path = path.slice(API_PREFIX.length)
  }

  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  return path === '' ? '/' : path
}

function toQuery(config: InternalAxiosRequestConfig): Record<string, string> {
  const query: Record<string, string> = {}

  const raw = config.url ?? ''
  const queryIndex = raw.indexOf('?')
  if (queryIndex >= 0) {
    new URLSearchParams(raw.slice(queryIndex + 1)).forEach((value, key) => {
      query[key] = value
    })
  }

  const params = config.params as Record<string, unknown> | undefined
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      // 空值不落进 query：页面把未填的筛选项原样传上来是常态，
      // 若转成 "undefined"/"" 会让 handler 误判成「用户填了空字符串」
      if (value === undefined || value === null || value === '') {
        continue
      }
      query[key] = String(value)
    }
  }

  return query
}

/** axios 的 transformRequest 已把 body 序列化成 JSON 字符串，这里还原成对象交给 handler */
function toBody(config: InternalAxiosRequestConfig): unknown {
  const data: unknown = config.data
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return data
    }
  }
  return data ?? null
}

/** 精确匹配优先：/consultations/counts 与 /consultations/:id 形状相同，靠这一轮先命中 counts */
function matchExact(routes: MockRoute[], method: string, path: string): MockRoute | null {
  return routes.find((route) => route.method === method && route.pattern === path) ?? null
}

/** 通配匹配：按段比对，':xxx' 段匹配任意非空值；不做正则，避免路径里的特殊字符被当成元字符 */
function matchPattern(routes: MockRoute[], method: string, path: string): MockRoute | null {
  const pathParts = path.split('/')

  for (const route of routes) {
    if (route.method !== method || !route.pattern.includes(':')) {
      continue
    }
    const patternParts = route.pattern.split('/')
    if (patternParts.length !== pathParts.length) {
      continue
    }
    const matched = patternParts.every(
      (part, index) => part.startsWith(':') || part === pathParts[index],
    )
    if (matched) {
      return route
    }
  }

  return null
}

function resolveRoute(
  routes: MockRoute[],
  method: 'GET' | 'POST',
  path: string,
): MockRoute | null {
  return matchExact(routes, method, path) ?? matchPattern(routes, method, path)
}

function delay(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, DELAY_MIN_MS + Math.random() * DELAY_RANGE_MS)
  })
}

/**
 * 组装 axios 响应。
 * status 恒 200（见文件头），headers 里回填 traceId 方便在浏览器 Network 面板直接对照日志。
 */
function buildResponse(
  config: InternalAxiosRequestConfig,
  reply: MockReply,
  traceId: string,
): AxiosResponse {
  const body: ApiResponse<unknown> = {
    code: reply.code,
    message: reply.message,
    data: reply.data,
    traceId,
    timestamp: new Date().toISOString(),
  }

  return {
    data: body,
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders({
      'Content-Type': 'application/json',
      [TRACE_ID_HEADER]: traceId,
    }),
    config,
    request: { mock: true },
  }
}

export function createMockAdapter(routes: MockRoute[]): AxiosAdapter {
  return async (config) => {
    // 延迟放在最前：未匹配路由也要有 loading 过程，否则 404 分支在页面上像「瞬间闪过」
    await delay()

    const traceId = readTraceId(config)
    const method = (config.method ?? 'get').toUpperCase()
    const path = resolvePath(config)

    if (method !== 'GET' && method !== 'POST') {
      return buildResponse(
        config,
        { code: ERROR_CODES.RESOURCE_NOT_FOUND, message: '资源不存在', data: null },
        traceId,
      )
    }

    const route = resolveRoute(routes, method, path)
    if (!route) {
      return buildResponse(
        config,
        { code: ERROR_CODES.RESOURCE_NOT_FOUND, message: '资源不存在', data: null },
        traceId,
      )
    }

    const ctx: MockContext = {
      method,
      path,
      query: toQuery(config),
      body: toBody(config),
    }

    try {
      const reply = await route.handler(ctx)
      return buildResponse(config, reply, traceId)
    } catch (error) {
      // handler 抛异常说明 mock 自己写错了；收敛成系统错误码而不是让请求悬死，
      // 页面至少能看到「系统内部错误」并带着 traceId 报障
      console.error(`[mock] ${method} ${path} handler failed`, error)
      return buildResponse(
        config,
        { code: ERROR_CODES.INTERNAL_ERROR, message: '系统内部错误', data: null },
        traceId,
      )
    }
  }
}
