/**
 * 脱敏字段规则（R8 / K-14）：前端只用于渲染占位，不含任何解掩码能力。
 * TODO(K-14)：按 maskLevel 落姓名 `李*` / 身份证 `110***********1234` / 手机 `138****8000` / 住院号 `****1234`。
 */
export type MaskLevel = 'name' | 'idCard' | 'phone' | 'inpatientNo' | 'generic'

export const MASK_LEVELS: MaskLevel[] = ['name', 'idCard', 'phone', 'inpatientNo', 'generic']
