import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ConsultStatus } from '@rcp/shared'

/**
 * 会诊工单视图状态。
 *
 * 红线：**store 只存视图状态，禁止存订单对象**——
 * 订单的唯一来源是接口，存一份就会与后端产生两份真相：
 * 流转后 store 里的旧对象不会自动更新，页面就会「列表变了、详情没变」。
 *
 * 这里只放「离开页面再回来还想保留」的东西：当前页签、搜索条件、页码、上次看的单号。
 * 列表数据、详情数据、计数一律由页面自己请求，用完即弃。
 */
export const useConsultStore = defineStore('modules/consult', () => {
  /** 当前页签：'' 表示全部 */
  const activeTab = ref<'' | ConsultStatus>('')

  /** 搜索条件（与接口 ConsultListQuery 的筛选字段一一对应） */
  const filters = reactive({
    patientName: '',
    departmentName: '',
    dateFrom: '',
    dateTo: '',
  })

  const page = ref(1)
  const pageSize = ref(10)

  /** 详情页当前 id：从详情返回列表时用它定位刚才那一行，避免用户重新翻页找 */
  const lastOrderId = ref<string | null>(null)

  function resetFilters(): void {
    filters.patientName = ''
    filters.departmentName = ''
    filters.dateFrom = ''
    filters.dateTo = ''
    // 清空条件后回到第一页：留在第 3 页会看到「条件清了但列表还是空的」的假象
    page.value = 1
  }

  function gotoPage(n: number): void {
    // 页码兜底：分页组件在边界处仍可能回调 0 或负数
    page.value = Math.max(1, Math.floor(n))
  }

  return { activeTab, filters, page, pageSize, lastOrderId, resetFilters, gotoPage }
})
