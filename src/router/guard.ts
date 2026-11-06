import type { Router } from 'vue-router'

/**
 * 全局守卫（K-07/K-10）：登录态 → 权限 → 留痕上报。
 * 脚手架阶段只占位，不做拦截，保证空页面可直接访问。
 */
export function setupRouterGuard(router: Router): void {
  router.beforeEach(() => {
    return true
  })
}
