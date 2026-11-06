/**
 * 契约级 Mock（P-01 / K-06）：响应体与 ApiResponse 完全一致，按域分文件。
 * TODO(K-06)：按域拆分 mock 文件、环境变量切换真实/Mock、可主动触发各段错误码。
 */
export const mockEnabled = import.meta.env.VITE_USE_MOCK === 'true'

/** 模拟网络延迟（毫秒） */
export const mockDelay = 300
