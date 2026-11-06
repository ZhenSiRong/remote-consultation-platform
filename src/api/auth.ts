import request from './request'

/** 认证接口（协议层）。TODO(K-20)：登录、刷新票据、登出留痕。 */
export function login(payload: { orgId: string; username: string; password: string; captcha: string }) {
  return request.post('/auth/login', payload)
}
