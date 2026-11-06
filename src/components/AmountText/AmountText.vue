<script setup lang="ts">
import { computed } from 'vue'
import { EMPTY_TEXT } from '@/utils/format'

/**
 * 金额（A-05 / K-16）：右对齐 + 两位小数 + 千分位。
 *
 * 格式化只在本组件内做一次：`utils/format` 目前还没有 formatAmount，
 * 而"金额直接打印原始数字"在列表页是明显不可用的（0.1+0.2 的尾数会原样露出）。
 * 等 formatAmount 落地后把这里换成 import 即可，调用方无需改动。
 */
interface Props {
  value: number | null | undefined
}

const props = defineProps<Props>()

const formatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const text = computed(() => {
  const value = props.value
  // NaN / Infinity 也走占位符：显示 `NaN` 比显示 `—` 更让人怀疑系统坏了
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_TEXT
  return formatter.format(value)
})
</script>

<template>
  <span class="amount-text">{{ text }}</span>
</template>

<style scoped>
.amount-text {
  display: inline-block;
  min-width: 96px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
