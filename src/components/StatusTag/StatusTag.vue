<script setup lang="ts">
import type { ConsultStatus } from '@/domain/consult/stateMachine'

/**
 * 状态标签（A-04 / K-12）：色点 + 文字，全站唯一状态渲染入口。
 * 本步只出壳：色点用 currentColor 跟随 token，7 态色值映射由 K-12 补全。
 */
withDefaults(defineProps<{ status: ConsultStatus; text?: string }>(), { text: '' })
</script>

<template>
  <span class="status-tag" :data-status="status">
    <i class="status-tag__dot" aria-hidden="true" />
    <span class="status-tag__text">{{ text || status }}</span>
  </span>
</template>

<style scoped>
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
}

.status-tag__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
</style>
