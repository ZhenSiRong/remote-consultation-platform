/** 全局业务实体类型。契约类型（ApiResponse / PageQuery / PageResult）请走 `@/api/types`（转出 @rcp/shared）。 */

/** 通用下拉选项 */
export interface SelectOption<V = string> {
  label: string
  value: V
  disabled?: boolean
}
