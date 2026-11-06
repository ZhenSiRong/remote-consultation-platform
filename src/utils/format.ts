/**
 * 展示层格式化工具（A-05 / K-16）。
 *
 * 铁律：页面禁止自行拼日期字符串、禁止 toFixed 拼金额。
 * 输入一律是契约里的 ISO 8601 带时区字符串（如 `2026-11-06T14:30:00+08:00`），
 * 展示时转浏览器本地时区。
 *
 * 为什么不用 dayjs：只用到「格式化 / 相对时间」两个能力，引入依赖不划算；
 * 且 Intl 与本地时区语义足够，避免多一份 locale 配置漂移。
 *
 * 非法输入（空串、乱码、null）不抛错，统一回落 `—`：
 * 只读展示区抛错会整块白屏，比显示占位符的代价高得多。
 */

/** 只读空值统一占位符（A-05 / K-16：只读空值 `—`，表单空值留空 + placeholder） */
export const EMPTY_TEXT = '—'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** 相对时间的最远展示档位：超过 30 天再写「37 天前」已无信息量，直接回落到日期 */
const RELATIVE_MAX_DAYS = 30

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** 解析契约时间串；非法返回 null，由调用方统一回落占位符 */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 2026-11-06 14:30 —— 空值返回 '—' */
export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value)
  if (!date) {
    return EMPTY_TEXT
  }
  const ymd = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  return `${ymd} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** 2026-11-06 */
export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value)
  if (!date) {
    return EMPTY_TEXT
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** 刚刚 / 3 分钟前 / 2 小时前 / 3 天前 / 超过 30 天回落到 formatDate */
export function formatRelative(value: string | null | undefined): string {
  const date = parseDate(value)
  if (!date) {
    return EMPTY_TEXT
  }

  const diff = Date.now() - date.getTime()
  // 未来时间（时钟漂移、服务端时间略超前）按「刚刚」处理，不显示「-1 分钟前」
  if (diff < MINUTE_MS) {
    return '刚刚'
  }
  if (diff < HOUR_MS) {
    return `${Math.floor(diff / MINUTE_MS)} 分钟前`
  }
  if (diff < DAY_MS) {
    return `${Math.floor(diff / HOUR_MS)} 小时前`
  }

  const days = Math.floor(diff / DAY_MS)
  if (days <= RELATIVE_MAX_DAYS) {
    return `${days} 天前`
  }
  return formatDate(value)
}

/**
 * 时长：'02:15'（分:秒）。
 * 分钟位不按 60 截断——会诊时长可能超过一小时，显示 '75:00' 比 '01:15:00' 更符合「会议计时」直觉。
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00'
  }
  const total = Math.floor(seconds)
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
}
