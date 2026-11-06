/**
 * Prisma client / 事务助手 / 分页助手（B-06 落地）。
 * 本步刻意不 import @prisma/client：schema 尚未生成 client，骨架要能在依赖未就绪时编译。
 * 这里是唯一允许出现 Prisma 的目录之一（另一处是 *.repository.prisma.ts），见 eslint.config.mjs 规则 6。
 */

export interface PageQuery {
  page: number
  pageSize: number
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** service 通过它开事务；controller 拿不到（lint 已拦） */
export interface TransactionRunner {
  run<T>(work: (tx: unknown) => Promise<T>): Promise<T>
}

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT')
export const TRANSACTION_RUNNER = Symbol('TRANSACTION_RUNNER')

export function toPageResult<T>(items: T[], total: number, query: PageQuery): PageResult<T> {
  return { items, total, page: query.page, pageSize: query.pageSize }
}
