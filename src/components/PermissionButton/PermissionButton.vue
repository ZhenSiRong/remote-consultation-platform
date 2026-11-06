<script setup lang="ts">
import { computed } from 'vue'
import { usePermission } from '@/composables/usePermission'

/**
 * 按钮级权限包装（A-10 / K-11）。
 *
 * 权限判断统一走 `usePermission().can()`，组件不自己拼权限字符串、也不读 store。
 * 无权限默认**不渲染**（用户看不见不该做的操作）；需要给出解释时用
 * `denied-mode="disable"` 置灰并挂 title，避免"按钮消失但没人知道为什么"。
 */
interface Props {
  /** 权限点，必须是 domain/authz 转出的常量 */
  permission: string
  /** 业务侧禁用（如未选中行），与无权限互不覆盖 */
  disabled?: boolean
  /** 按钮文案，也可用默认插槽 */
  text?: string
  /** 无权限时的表现，默认 'hide' */
  deniedMode?: 'hide' | 'disable'
  /** 视觉类型，默认 'default' */
  variant?: 'default' | 'primary' | 'danger'
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  text: '',
  deniedMode: 'hide',
  variant: 'default',
})

const emit = defineEmits<{ click: [ev: MouseEvent] }>()

const { can } = usePermission()

const allowed = computed(() => can(props.permission))
/** hide 模式下无权限直接不渲染；disable 模式保留占位并置灰 */
const visible = computed(() => allowed.value || props.deniedMode === 'disable')
const isDisabled = computed(() => props.disabled || !allowed.value)

function handleClick(ev: MouseEvent): void {
  // 置灰按钮在部分浏览器仍会触发 click（如键盘 Enter），这里再兜一层
  if (isDisabled.value) return
  emit('click', ev)
}
</script>

<template>
  <button
    v-if="visible"
    class="permission-button"
    :class="`permission-button--${props.variant}`"
    type="button"
    :disabled="isDisabled"
    :title="allowed ? undefined : '无操作权限'"
    @click="handleClick"
  >
    <slot>{{ props.text }}</slot>
  </button>
</template>

<style scoped>
.permission-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  height: 32px;
  padding: 0 var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-container);
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  cursor: pointer;
}

.permission-button:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.permission-button--primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-bg-container);
}

.permission-button--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: var(--color-bg-container);
}

.permission-button--danger {
  border-color: var(--status-danger);
  color: var(--status-danger);
}

.permission-button--danger:hover:not(:disabled) {
  background: var(--status-danger);
  color: var(--color-bg-container);
}

.permission-button:disabled {
  border-color: var(--color-border-light);
  background: var(--color-bg-page);
  color: var(--color-text-disabled);
  cursor: not-allowed;
}
</style>
