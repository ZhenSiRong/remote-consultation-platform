<script setup lang="ts">
import { computed } from 'vue'
import type { MaskLevel } from '@/domain/mask/rules'
import { maskByLevel } from '@/domain/mask/rules'

/**
 * 脱敏字段展示（R8 / K-14）。
 *
 * 组件只做"显示占位"这一件事：入参进来立刻掩码，DOM 里从头到尾不存在原文，
 * 所以 title 也只放固定的"已脱敏"说明，绝不能把 value 塞进去——
 * 否则鼠标悬停、页面源码、复制粘贴三处都会泄露。
 */
interface Props {
  value: string | null | undefined
  /** 脱敏级别，默认 generic（保留前 3 后 4） */
  level?: MaskLevel
  /** 无值时的占位，默认 `—` */
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), { level: 'generic', placeholder: '—' })

const masked = computed(() => {
  const raw = props.value
  if (raw === null || raw === undefined || raw.trim() === '') return props.placeholder
  return maskByLevel(raw, props.level)
})
</script>

<template>
  <span class="masked-text" :data-mask-level="props.level" title="已脱敏（R8）">{{ masked }}</span>
</template>

<style scoped>
.masked-text {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
