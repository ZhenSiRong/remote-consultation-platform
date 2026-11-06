/**
 * 按钮/路由级权限判断（A-10 / K-11）。
 * TODO(K-09/K-11)：接 store/kernel/permission 与 @rcp/shared 的权限点常量；
 * 当前为脚手架占位，默认放行，避免骨架阶段整站被隐藏。
 */
const granted = new Set<string>(['*'])

export function usePermission() {
  function can(permission: string): boolean {
    return granted.has('*') || granted.has(permission)
  }

  return { can }
}
