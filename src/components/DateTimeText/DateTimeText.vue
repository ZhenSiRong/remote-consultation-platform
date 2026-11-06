<script setup lang="ts">
import { computed } from 'vue'
import { formatDate, formatDateTime, formatRelative } from '@/utils/format'

/**
 * 时间展示（A-05 / K-16）。
 *
 * 格式化只有 utils/format 一份实现，组件不再自己 slice/拼字符串——
 * 页面各处时间格式不一致，几乎都是因为每个页面各写了一遍 toLocaleString。
 * 空值的 `—` 也由 format 层统一处理，这里只负责选模式。
 */
interface Props {
  value: string | null | undefined
  /** 'datetime' 完整时间 | 'date' 仅日期 | 'relative' 相对时间，默认 'datetime' */
  mode?: 'datetime' | 'date' | 'relative'
}

const props = withDefaults(defineProps<Props>(), { mode: 'datetime' })

const text = computed(() => {
  switch (props.mode) {
    case 'date':
      return formatDate(props.value)
    case 'relative':
      return formatRelative(props.value)
    default:
      return formatDateTime(props.value)
  }
})
</script>

<template>
  <span class="date-time-text" :data-mode="props.mode">{{ text }}</span>
</template>

<style scoped>
.date-time-text {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
