import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * 会诊工单域状态（Kernel 之外按域划分）。TODO(C-01/C-05)：列表筛选条件、当前工单。
 */
export const useConsultStore = defineStore('modules/consult', () => {
  const currentOrderId = ref<string | null>(null)

  function setCurrentOrder(id: string | null): void {
    currentOrderId.value = id
  }

  return { currentOrderId, setCurrentOrder }
})
