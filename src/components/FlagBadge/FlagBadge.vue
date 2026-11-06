<script setup lang="ts">
import type { FlagType } from './types'

/**
 * 叠加标记（K-12）：超时 / 异常 / 待补签 / 录制中 / 已脱敏，可与主态叠加。
 */
withDefaults(defineProps<{ type: FlagType; text?: string }>(), { text: '' })
</script>

<template>
  <span class="flag-badge" :data-flag="type">
    {{ text || type }}
  </span>
</template>

<style scoped>
.flag-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--spacing-xs);
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}
</style>
