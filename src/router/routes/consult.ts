import type { RouteRecordRaw } from 'vue-router'
import { PERMISSIONS } from '@rcp/shared'

/**
 * 会诊工单域路由（path kebab-case / name PascalCase，K-07 规范）。
 *
 * meta 只写路由实际需要的字段；`permission` 仅在契约里存在对应权限点时才写，**禁止臆造**。
 * 依据 shared/src/authz/permissions.ts：consult 段只有 `consult:consultation:create`
 * 与 `consult:consultation:invite` 两个点，没有 list / read。写一个不存在的字符串比不写更糟——
 * 将来接入权限校验时它会静默 403；而空字符串又会被误读成"已声明但没配"，所以列表/详情干脆不写。
 *
 * 路由顺序是硬约束：`/consult/create` 必须排在 `/consult/:id` 之前。
 * vue-router 按声明顺序匹配，`:id` 会把 'create' 当成工单 id 吃掉，发起页将永远打不开。
 */
const consultRoutes: RouteRecordRaw[] = [
  {
    path: '/consult',
    name: 'ConsultList',
    component: () => import('@/views/consult/ConsultList.vue'),
    // 列表是登录即可见的基础视图，契约里没有 list 权限点，故不声明 permission
    meta: { title: '会诊工单', keepAlive: true },
  },
  {
    path: '/consult/create',
    name: 'ConsultCreate',
    component: () => import('@/views/consult/ConsultCreate.vue'),
    // 发起会诊是契约里真实存在的权限点，必须引用常量而不是手抄字符串
    meta: { title: '发起会诊', permission: PERMISSIONS.CONSULTATION_CREATE, keepAlive: false },
  },
  {
    path: '/consult/:id',
    name: 'ConsultDetail',
    component: () => import('@/views/consult/ConsultDetail.vue'),
    meta: { title: '会诊详情', keepAlive: false },
  },
]

export default consultRoutes
