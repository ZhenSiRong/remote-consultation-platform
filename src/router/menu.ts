/**
 * 菜单生成（A-10 / K-10）：菜单必须由权限点集合生成，禁止手写死菜单数组。
 * 脚手架阶段返回空数组，待 K-10 接入 store/kernel/permission。
 */
export interface MenuItem {
  key: string
  title: string
  path: string
  children?: MenuItem[]
}

export function buildMenu(_permissions: ReadonlySet<string>): MenuItem[] {
  return []
}
