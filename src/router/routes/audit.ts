import type { RouteRecordRaw } from 'vue-router'

/** 合规审计域路由 */
const auditRoutes: RouteRecordRaw[] = [
  {
    path: '/audit',
    name: 'AuditLogList',
    component: () => import('@/views/audit/AuditLogList.vue'),
    meta: { title: '审计日志', permission: 'audit_log:log:list', keepAlive: true },
  },
]

export default auditRoutes
