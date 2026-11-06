import type { RouteRecordRaw } from 'vue-router'

/** 会诊记录域路由 */
const recordRoutes: RouteRecordRaw[] = [
  {
    path: '/record',
    name: 'RecordList',
    component: () => import('@/views/record/RecordList.vue'),
    meta: { title: '会诊记录', permission: 'record:doc:list', keepAlive: true },
  },
]

export default recordRoutes
