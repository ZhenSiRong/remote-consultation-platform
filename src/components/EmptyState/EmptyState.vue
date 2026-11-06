<script setup lang="ts">
import { computed } from 'vue'

/**
 * 空态四态（K-16）：无数据 / 无搜索结果 / 加载失败 / 无权限。
 *
 * 四态必须互不混用——"加载失败"配重试、"无权限"配申请入口、"搜不到"配改条件，
 * 文案与行动指引一一对应，用户才知道下一步能做什么。
 * 插画用内联 SVG，不引图标库：空态图是装饰性的，没必要为它多一个运行时依赖。
 */
type EmptyType = 'empty' | 'search' | 'error' | 'forbidden'

interface Props {
  /** 四态，默认 'empty' */
  type?: EmptyType
  /** 主标题，不传用该态默认文案 */
  title?: string
  /** 补充说明，不传用该态默认说明 */
  description?: string
  /** 主按钮文案，不传则不渲染按钮 */
  actionText?: string
}

const props = withDefaults(defineProps<Props>(), { type: 'empty', title: '', description: '', actionText: '' })

const emit = defineEmits<{ action: [] }>()

const DEFAULT_TITLE: Record<EmptyType, string> = {
  empty: '暂无数据',
  search: '没有找到匹配的结果',
  error: '加载失败',
  forbidden: '无访问权限',
}

const DEFAULT_DESCRIPTION: Record<EmptyType, string> = {
  empty: '当前还没有内容，稍后再来看看',
  search: '试试更换关键词或放宽筛选条件',
  error: '请稍后重试，若持续失败请联系管理员',
  forbidden: '如需访问，请联系管理员申请授权',
}

const resolvedTitle = computed(() => props.title || DEFAULT_TITLE[props.type])
const resolvedDescription = computed(() => props.description || DEFAULT_DESCRIPTION[props.type])
</script>

<template>
  <div class="empty-state" :data-type="props.type">
    <div class="empty-state__illustration" aria-hidden="true">
      <!-- 无数据：空托盘 -->
      <svg v-if="props.type === 'empty'" viewBox="0 0 120 96" width="120" height="96">
        <rect x="24" y="26" width="72" height="48" rx="6" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="M24 56h20l6 8h20l6-8h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <path d="M48 38h24" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5" />
      </svg>

      <!-- 搜不到：放大镜 + 短横线 -->
      <svg v-else-if="props.type === 'search'" viewBox="0 0 120 96" width="120" height="96">
        <circle cx="52" cy="44" r="20" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="M67 59l14 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <path d="M44 44h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5" />
      </svg>

      <!-- 加载失败：警示三角 -->
      <svg v-else-if="props.type === 'error'" viewBox="0 0 120 96" width="120" height="96">
        <path
          d="M60 26l26 44H34z"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <path d="M60 44v12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <circle cx="60" cy="63" r="1.6" fill="currentColor" />
      </svg>

      <!-- 无权限：锁 -->
      <svg v-else viewBox="0 0 120 96" width="120" height="96">
        <rect x="42" y="46" width="36" height="28" rx="5" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="M50 46v-8a10 10 0 0120 0v8" fill="none" stroke="currentColor" stroke-width="2" />
        <circle cx="60" cy="60" r="2.5" fill="currentColor" />
      </svg>
    </div>

    <p class="empty-state__title">{{ resolvedTitle }}</p>
    <p class="empty-state__description">{{ resolvedDescription }}</p>

    <button v-if="props.actionText" class="empty-state__action" type="button" @click="emit('action')">
      {{ props.actionText }}
    </button>

    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-2xl) var(--spacing-lg);
  color: var(--color-text-tertiary);
  text-align: center;
}

.empty-state__illustration {
  color: var(--color-text-disabled);
}

.empty-state__illustration svg {
  display: block;
}

.empty-state__title {
  margin: 0;
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
}

.empty-state__description {
  margin: 0;
  font-size: var(--font-size-base);
  color: var(--color-text-tertiary);
}

.empty-state__action {
  margin-top: var(--spacing-sm);
  padding: 0 var(--spacing-lg);
  height: 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: var(--color-bg-container);
  font-size: var(--font-size-base);
  cursor: pointer;
}

.empty-state__action:hover {
  background: var(--color-primary-hover);
}
</style>
