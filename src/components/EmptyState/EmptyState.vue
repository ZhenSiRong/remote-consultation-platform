<script setup lang="ts">
import { computed } from 'vue'

/**
 * 空态四态（K-16）：无数据 / 无权限（带申请入口）/ 加载失败（可重试）/ 加载中（骨架屏），互不混用。
 */
const props = withDefaults(
  defineProps<{ type?: 'empty' | 'forbidden' | 'error' | 'loading'; description?: string }>(),
  { type: 'empty', description: '' },
)

const DEFAULT_TEXT: Record<NonNullable<typeof props.type>, string> = {
  empty: '暂无数据',
  forbidden: '暂无权限查看，可申请授权',
  error: '加载失败，点击重试',
  loading: '加载中…',
}

const text = computed(() => props.description || DEFAULT_TEXT[props.type])
</script>

<template>
  <div class="empty-state" :data-type="props.type">
    <p class="empty-state__text">{{ text }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
  background: var(--color-bg-muted);
  color: var(--color-text-secondary);
  text-align: center;
}

.empty-state__text {
  margin: 0;
}
</style>
