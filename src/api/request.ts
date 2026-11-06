import axios, { type AxiosInstance } from 'axios'

/**
 * 请求实例（A-07/A-09 / K-04）。
 * TODO(K-04)：请求拦截器注入 Authorization / X-Org-Id / X-Trace-Id（+ 可选 Idempotency-Key、X-Authz-Ticket）；
 *             响应拦截器统一 code 分流（10002 跳登录、10003 无权限页），data 仅在 code=0 时返回。
 */
export const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 15_000,
})

export default request
