<script setup lang="ts">
import { EMPTY_TEXT } from '@/utils/format'

/**
 * 时间（A-05 / K-16）：统一 yyyy-MM-dd HH:mm:ss，空值 —。
 * 本步只出壳，格式化统一走 utils/format（K-16 落地）。
 */
const props = defineProps<{ value: string | number | Date | null | undefined }>()
</script>

<template>
  <span class="date-time-text">{{ props.value ?? EMPTY_TEXT }}</span>
</template>

<style scoped>
.date-time-text {
  font-variant-numeric: tabular-nums;
}
</style>
