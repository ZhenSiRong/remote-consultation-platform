/**
 * 脱敏字段规则（R8 / K-14）。
 *
 * 铁律：前端只做**显示占位**，本文件及整个前端不提供任何解掩码 / 解密能力。
 * 服务端下发的已经是脱敏后的值，这里只是把"可识别片段"进一步压缩成占位，
 * 保证列表页、日志、截图里都不出现完整姓名 / 证件号 / 手机号 / 住院号。
 * 任何"把 * 还原成原文"的诉求都必须回服务端重新鉴权取数，前端不做也做不了。
 *
 * 边界约定（三条，全函数统一）：
 * 1. 空值（null / undefined / 空串）→ 返回空串，由调用方决定占位符（`—`）；
 * 2. 长度不足以同时保留头尾 → 返回等长全 `*`，**不抛错也不回退原文**；
 * 3. 掩码用 `*` 逐字符等长替换，保持字段宽度稳定，避免表格列宽跳动。
 */
export type MaskLevel = 'name' | 'idCard' | 'phone' | 'inpatientNo' | 'generic'

export const MASK_LEVELS: MaskLevel[] = ['name', 'idCard', 'phone', 'inpatientNo', 'generic']

/**
 * 复姓表：姓名脱敏要保留完整的姓，`欧阳锋` → `欧阳*` 而不是 `欧**`。
 * 只收常见两字复姓；未收录的按单字姓处理（错成 `司**` 也不会泄露更多信息）。
 */
const COMPOUND_SURNAMES = [
  '欧阳',
  '司马',
  '上官',
  '诸葛',
  '东方',
  '独孤',
  '南宫',
  '慕容',
  '皇甫',
  '尉迟',
  '公孙',
  '长孙',
  '宇文',
  '司徒',
  '司空',
  '夏侯',
  '令狐',
  '钟离',
  '端木',
  '赫连',
  '澹台',
  '公冶',
  '宗政',
  '濮阳',
  '淳于',
  '单于',
  '太叔',
  '申屠',
  '公羊',
  '轩辕',
  '拓跋',
  '百里',
  '呼延',
  '万俟',
  '闻人',
]

/** 姓名：保留姓，名用 `*` 替代。`李四` → `李*`，`欧阳锋` → `欧阳*` */
export function maskName(name: string): string {
  const raw = name.trim()
  if (!raw) return ''
  // 复姓要求至少还有 1 个字的名，否则 `欧阳` 这种两字姓名会被原样返回
  const keep = raw.length > 2 && COMPOUND_SURNAMES.some((s) => raw.startsWith(s)) ? 2 : 1
  if (raw.length <= keep) return '*'.repeat(raw.length)
  return raw.slice(0, keep) + '*'.repeat(raw.length - keep)
}

/** 身份证：前 3 后 4。`110101199001011234` → `110***********1234` */
export function maskIdCard(id: string): string {
  return maskGeneric(id, 3, 4)
}

/** 手机：前 3 后 4。`13800138000` → `138****8000` */
export function maskPhone(phone: string): string {
  return maskGeneric(phone, 3, 4)
}

/** 住院号：只留后 4。`ZY202400001234` → `**********1234` */
export function maskInpatientNo(no: string): string {
  const raw = no.trim()
  if (!raw) return ''
  if (raw.length <= 4) return '*'.repeat(raw.length)
  return '*'.repeat(raw.length - 4) + raw.slice(-4)
}

/**
 * 通用：保留前 keep 后 tail，中间 `*`。
 * 长度不足（含刚好等于 keep + tail）时返回全 `*`——否则头尾重叠会拼出原文。
 */
export function maskGeneric(value: string, keep = 3, tail = 4): string {
  const raw = value.trim()
  if (!raw) return ''
  if (keep < 0 || tail < 0) return '*'.repeat(raw.length)
  if (raw.length <= keep + tail) return '*'.repeat(raw.length)
  return raw.slice(0, keep) + '*'.repeat(raw.length - keep - tail) + raw.slice(raw.length - tail)
}

/** 按 level 分派；未知 level 兜底走 generic（运行期可能收到脏数据） */
export function maskByLevel(value: string, level: MaskLevel): string {
  switch (level) {
    case 'name':
      return maskName(value)
    case 'idCard':
      return maskIdCard(value)
    case 'phone':
      return maskPhone(value)
    case 'inpatientNo':
      return maskInpatientNo(value)
    default:
      return maskGeneric(value)
  }
}
