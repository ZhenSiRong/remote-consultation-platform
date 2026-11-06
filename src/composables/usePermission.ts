/**
 * 按钮/路由级权限判断（A-10 / K-11）。
 *
 * 当前是**演示态直通**：不接真实登录态，直接给一份「全部权限」的会话，
 * 保证骨架阶段所有入口都能走通、不被自己挡在门外。
 *
 * 接真后端时要换掉的地方只有 `DEV_PERMISSIONS` 的来源：
 * 改为从 store 里当前用户的角色出发，经 `@rcp/shared` 的 `ROLE_PERMISSIONS` 派生权限点集合。
 * `can()` 的调用方一行都不用改，所以这里把返回值形状固定成 `{ can, permissions }`。
 */

/** dev 直通：'*' 视为拥有全部权限（与后端约定的通配符，不要用具体权限点冒充） */
const DEV_PERMISSIONS = ['*'] as const

export function usePermission(): {
  can(point: string): boolean
  permissions: readonly string[]
} {
  const granted = new Set<string>(DEV_PERMISSIONS)

  function can(point: string): boolean {
    return granted.has('*') || granted.has(point)
  }

  return { can, permissions: DEV_PERMISSIONS }
}
