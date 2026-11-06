import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * 用户 / 机构 / 角色（Kernel）。TODO(K-20)：登录态与 token 仅存内存，不落 localStorage。
 */
export const useUserStore = defineStore('kernel/user', () => {
  const userId = ref<string | null>(null)
  const userName = ref('')
  const orgId = ref<string | null>(null)
  const orgName = ref('')
  const roles = ref<string[]>([])

  function reset(): void {
    userId.value = null
    userName.value = ''
    orgId.value = null
    orgName.value = ''
    roles.value = []
  }

  return { userId, userName, orgId, orgName, roles, reset }
})
