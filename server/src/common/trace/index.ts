import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

/**
 * traceId 载体（B-03 补齐中间件 / Prisma 中间件 / 日志 redact）。
 * 规则：入口读 X-Trace-Id 并校验格式（16–32 hex），缺失或非法由后端生成。
 */
export const TRACE_ID_HEADER = 'x-trace-id'
export const TRACE_ID_PATTERN = /^[0-9a-f]{16,32}$/i

export interface TraceContext {
  traceId: string
}

export const traceStorage = new AsyncLocalStorage<TraceContext>()

export function isValidTraceId(value: unknown): value is string {
  return typeof value === 'string' && TRACE_ID_PATTERN.test(value)
}

/** 32 位 hex，与前端 K-02 生成的格式一致 */
export function generateTraceId(): string {
  return randomUUID().replace(/-/g, '')
}

export function getTraceId(): string | undefined {
  return traceStorage.getStore()?.traceId
}
