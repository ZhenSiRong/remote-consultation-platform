import type { RouteRecordRaw } from 'vue-router'

/** 病历共享域路由 */
const emrRoutes: RouteRecordRaw[] = [
  {
    path: '/emr',
    name: 'EmrTimeline',
    component: () => import('@/views/emr/EmrTimeline.vue'),
    meta: { title: '病历共享', permission: 'patient_record:read', keepAlive: true },
  },
]

export default emrRoutes
