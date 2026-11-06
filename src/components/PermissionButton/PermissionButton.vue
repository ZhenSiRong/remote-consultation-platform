<script setup lang="ts">
import { usePermission } from '@/composables/usePermission'

/**
 * 按钮级权限包装（A-10 / K-11）：无权限默认不渲染，需解释时用 disabled + tooltip。
 * 权限字符串必须是 domain/authz 转出的常量，组件不自行拼接。
 */
const props = withDefaults(
  defineProps<{ permission: string; disabled?: boolean; text?: string }>(),
  { disabled: false, text: '' },
)

const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

const { can } = usePermission()
</script>

<template>
  <button
    v-if="can(props.permission)"
    class="permission-button"
    type="button"
    :disabled="props.disabled"
    @click="emit('click', $event)"
  >
    <slot>{{ props.text }}</slot>
  </button>
</template>

<style scoped>
.permission-button {
  padding: 0 var(--spacing-md);
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-container);
  color: var(--color-text-primary);
  cursor: pointer;
}

.permission-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
