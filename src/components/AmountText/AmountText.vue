<script setup lang="ts">
import { EMPTY_TEXT } from '@/utils/format'

/**
 * 金额（A-05 / K-16）：右对齐 + 两位小数 + 千分位。
 * 本步只出壳与对齐，格式化统一走 utils/format（K-16 落地）。
 */
const props = defineProps<{ value: number | null | undefined }>()
</script>

<template>
  <span class="amount-text">{{ props.value ?? EMPTY_TEXT }}</span>
</template>

<style scoped>
.amount-text {
  display: inline-block;
  min-width: 96px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
