import type { RouteRecordRaw } from 'vue-router'

/** 会诊工单域路由（path kebab-case / name PascalCase / meta 三字段，K-07 规范） */
const consultRoutes: RouteRecordRaw[] = [
  {
    path: '/consult',
    name: 'ConsultList',
    component: () => import('@/views/consult/ConsultList.vue'),
    meta: { title: '会诊工单', permission: 'consult:order:list', keepAlive: true },
  },
]

export default consultRoutes
