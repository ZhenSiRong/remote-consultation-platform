<script setup lang="ts">
import { computed } from 'vue'
import type { MaskLevel } from '@/domain/mask/rules'
import { EMPTY_TEXT } from '@/utils/format'

/**
 * 脱敏字段展示（R8 / K-14）：按 maskLevel 渲染，组件内不存在 unmask/decrypt。
 * 本步只出通用占位实现；各字段的精确掩码形态由 K-14 补全。
 */
const props = withDefaults(defineProps<{ value: string; maskLevel?: MaskLevel }>(), {
  maskLevel: 'generic',
})

const masked = computed(() => {
  const raw = props.value
  if (!raw) return EMPTY_TEXT
  return raw.slice(0, 1) + '*'.repeat(Math.max(0, raw.length - 1))
})
</script>

<template>
  <span class="masked-text" :data-mask-level="props.maskLevel">{{ masked }}</span>
</template>

<style scoped>
.masked-text {
  font-variant-numeric: tabular-nums;
}
</style>
