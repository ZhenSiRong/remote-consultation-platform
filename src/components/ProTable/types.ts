/** ProTable 列定义（K-17/K-18 补全：宽度、冻结、插槽名、对齐） */
export interface ProTableColumn {
  /** 行数据字段名 */
  key: string
  /** 表头文案 */
  title: string
  /** 列宽，不传按内容自适应 */
  width?: number
  /** 是否右对齐（金额列） */
  align?: 'left' | 'center' | 'right'
}
