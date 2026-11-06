/**
 * 分页契约 —— A-08 / 架构决策.md 3.5C
 *
 * - 请求：`page` 从 1 起；`pageSize` 默认 20、上限 100；`sortBy` / `sortOrder` 可选。
 * - 业务筛选参数**平铺在 query 上**（`patientName`、`status`、`dateFrom`、`dateTo`），不包一层 `filter`。
 * - 响应：`data: { list, total, page, pageSize }`。
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const SORT_ORDERS = ['ASC', 'DESC'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export interface PageQuery {
  /** 从 1 起 */
  page: number;
  /** 默认 20，上限 100 */
  pageSize: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
