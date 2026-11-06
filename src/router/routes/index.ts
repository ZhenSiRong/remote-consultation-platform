import type { RouteRecordRaw } from 'vue-router'
import { BlankLayout } from '@/layouts/BlankLayout'
import { DefaultLayout } from '@/layouts/DefaultLayout'
import auditRoutes from './audit'
import consultRoutes from './consult'
import emrRoutes from './emr'
import recordRoutes from './record'

/**
 * 路由总表：四域按文件拆分，统一在此注册（K-07）。
 * 登录页走 BlankLayout，其余业务页在 DefaultLayout 内渲染，未知路径落 404。
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: BlankLayout,
    children: [
      {
        path: '',
        name: 'Login',
        component: () => import('@/views/login/Login.vue'),
        meta: { title: '登录', permission: '', keepAlive: false },
      },
    ],
  },
  {
    path: '/',
    component: DefaultLayout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/Dashboard.vue'),
        meta: { title: '工作台', permission: '', keepAlive: true },
      },
      ...consultRoutes,
      ...recordRoutes,
      ...emrRoutes,
      ...auditRoutes,
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '页面不存在', permission: '', keepAlive: false },
  },
]

export default routes
