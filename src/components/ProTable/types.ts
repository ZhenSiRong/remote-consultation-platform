/**
 * ProTable 列定义（K-17）。
 *
 * 列只描述"展示什么"，不描述"怎么渲染组件"：
 * 需要 StatusTag / MaskedText 这类组件时，页面用 `#cell-{key}` 插槽覆盖，
 * 组件库不反向依赖业务组件。
 */
export interface ProTableColumn<T = Record<string, unknown>> {
  /** 行数据字段名，同时决定插槽名 `#cell-{key}` */
  key: string
  /** 表头文案 */
  title: string
  /** 列宽：数字按 px，字符串原样（如 '20%'） */
  width?: number | string
  /** 对齐方式，金额列用 right */
  align?: 'left' | 'center' | 'right'
  /** 纯文本格式化：拿到整行，返回字符串；返回组件请改用插槽 */
  render?: (row: T) => string
  /** 是否可排序（本地排序，不触发后端） */
  sortable?: boolean
}
