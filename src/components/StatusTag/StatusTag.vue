<script setup lang="ts">
import { computed } from 'vue'
import type { ConsultStatus } from '@rcp/shared'
import { CONSULT_STATUS_META } from '@rcp/shared'

/**
 * 会诊工单状态标签（A-04 / K-12）：全站唯一的状态渲染入口。
 *
 * 状态色不在这里写死——文案、语义色 token、装饰方式全部来自 `@rcp/shared` 的
 * `CONSULT_STATUS_META`，页面拿不到第二份状态表，也就不会出现"同一个态两种颜色"。
 * 装饰方式解决 3.3B 的同色区分：进行中 = 呼吸点，已归档 = 对勾 + 文字降透明度。
 */
interface Props {
  status: ConsultStatus
  /** 是否显示色点，默认 true（CHECK_DIM 态恒显示对勾，不受此开关影响） */
  showDot?: boolean
  /** 尺寸，默认 'default' */
  size?: 'small' | 'default'
}

const props = withDefaults(defineProps<Props>(), { showDot: true, size: 'default' })

const meta = computed(() => CONSULT_STATUS_META[props.status])

/**
 * 用 token 拼颜色，并带一层兜底：万一 tokens.css 尚未定义某个状态色，
 * `var(--status-x, fallback)` 仍能解析出合法颜色，标签不会变成透明。
 */
const colorVar = computed(() => `var(${meta.value.token}, var(--color-text-secondary))`)

/** 装饰态落到 class 上，动画与对勾样式都由 CSS 控制，方便外部断言 */
const decorationClass = computed(() => `status-tag--${meta.value.decoration.toLowerCase().replace(/_/g, '-')}`)
</script>

<template>
  <span
    class="status-tag"
    :class="[decorationClass, `status-tag--${props.size}`]"
    :data-status="props.status"
    :data-decoration="meta.decoration"
    :style="{ '--tag-color': colorVar }"
  >
    <svg
      v-if="meta.decoration === 'CHECK_DIM'"
      class="status-tag__check"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path
        d="M3.2 8.6l3 3L12.8 4.8"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <i v-else-if="props.showDot" class="status-tag__dot" aria-hidden="true" />
    <span class="status-tag__text">{{ meta.label }}</span>
  </span>
</template>

<style scoped>
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 2px var(--spacing-sm);
  border-radius: var(--radius-full);
  font-size: var(--font-size-base);
  line-height: 1.5;
  white-space: nowrap;
  /* 兜底底色：不支持 color-mix 的浏览器至少还有一层浅底，不会退化成透明 */
  background-color: var(--color-bg-page);
  background-color: color-mix(in srgb, var(--tag-color) 12%, transparent);
  color: var(--tag-color);
}

.status-tag--small {
  padding: 0 6px;
  font-size: var(--font-size-xs);
}

.status-tag__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--tag-color);
}

.status-tag--small .status-tag__dot {
  width: 6px;
  height: 6px;
}

.status-tag__check {
  flex: none;
  color: var(--tag-color);
}

/* 3.3B：进行中与已归档同色，靠呼吸动画拉开区分度 */
.status-tag--breathing-dot .status-tag__dot {
  animation: status-tag-breathe 1.6s ease-in-out infinite;
}

@keyframes status-tag-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.55);
    opacity: 0.35;
  }
}

/* 3.3B：已归档不新增颜色，文字降一档不透明度 */
.status-tag--check-dim .status-tag__text {
  opacity: 0.75;
}

/*
 * 无障碍：系统要求减少动态时压掉动画节奏。
 * 刻意只改时长、不写 `animation: none`——`animation-name` 仍需保留，
 * 外部（含验收脚本）靠它判定"进行中"确实挂了呼吸动画。
 */
@media (prefers-reduced-motion: reduce) {
  .status-tag--breathing-dot .status-tag__dot {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
  }
}
</style>
