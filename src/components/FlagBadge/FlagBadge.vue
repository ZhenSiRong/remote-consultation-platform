<script setup lang="ts">
import { computed } from 'vue'
import type { ConsultFlag } from '@rcp/shared'
import { CONSULT_FLAG_META } from '@rcp/shared'
import type { FlagType } from './types'

/**
 * 叠加标记（K-12）：超时 / 异常 / 待补签 / 录制中 / 已脱敏，可与主态叠加。
 *
 * 文案与颜色都取自 `@rcp/shared` 的 flag 字典，组件只负责把本地短码翻译成契约码——
 * 页面写 `type="timeout"` 就行，不用背 UPPER_SNAKE，也不会出现"两处文案不一致"。
 */
const FLAG_CODE: Record<FlagType, ConsultFlag> = {
  timeout: 'TIMEOUT',
  abnormal: 'EXCEPTION',
  'pending-sign': 'PENDING_COSIGN',
  recording: 'RECORDING',
  masked: 'MASKED',
}

interface Props {
  type: FlagType
  /** 覆盖默认文案，不传用字典 label */
  text?: string
}

const props = withDefaults(defineProps<Props>(), { text: '' })

const meta = computed(() => CONSULT_FLAG_META[FLAG_CODE[props.type]])
const colorVar = computed(() => `var(${meta.value.token}, var(--color-text-secondary))`)
</script>

<template>
  <span
    class="flag-badge"
    :class="{ 'flag-badge--animated': meta.animated }"
    :data-flag="props.type"
    :style="{ '--flag-color': colorVar }"
  >
    <i class="flag-badge__dot" aria-hidden="true" />
    <span class="flag-badge__text">{{ props.text || meta.label }}</span>
  </span>
</template>

<style scoped>
.flag-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 0 var(--spacing-sm);
  border: 1px solid var(--flag-color);
  border-radius: var(--radius-sm);
  background: var(--color-bg-container);
  background: color-mix(in srgb, var(--flag-color) 10%, transparent);
  color: var(--flag-color);
  font-size: var(--font-size-xs);
  line-height: 20px;
  white-space: nowrap;
}

.flag-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--flag-color);
}

/* 录制中是唯一会动的 flag，动效本身就是"正在进行"的信号 */
.flag-badge--animated .flag-badge__dot {
  animation: flag-badge-blink 1.2s ease-in-out infinite;
}

@keyframes flag-badge-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.2;
  }
}
</style>
