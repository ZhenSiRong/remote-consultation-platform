<script setup lang="ts">
import type { PrecheckResult } from '@/api/consult'

/**
 * 合规预检面板（R1 机构协议 / R4 知情同意 / R5 执业范围 / R6 电子签名）。
 *
 * 面板只做「把接口结论翻译成人话」，不做任何业务判断：
 * 哪几项、是否通过、阻断原因全部来自 `precheckConsult` 的返回，
 * 页面和 mock 各自算一套的话，演示时就会出现「面板说通过、提交却报 20003」。
 *
 * 四个稳定 class（验收脚本依赖）：`.compliance-panel` / `.compliance-panel__item`
 * / `.compliance-panel__item--fail` / `.compliance-panel__blocked`。
 */
interface Props {
  /** 预检结论；null 表示还没选患者，尚未校验 */
  result: PrecheckResult | null
  /** 校验请求进行中：此时隐藏旧结论，避免「刚换患者还显示上一个人的通过态」 */
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), { loading: false })
</script>

<template>
  <div class="compliance-panel" :aria-busy="props.loading">
    <!-- 阻断条置顶：未通过时用户第一眼要看到「不能提交」，而不是先读四项明细 -->
    <div v-if="!props.loading && props.result?.blocked" class="compliance-panel__blocked" role="alert">
      <span class="compliance-panel__blocked-icon" aria-hidden="true">!</span>
      <div class="compliance-panel__blocked-body">
        <p class="compliance-panel__blocked-title">合规校验未通过，无法发起会诊</p>
        <p class="compliance-panel__blocked-code">阻断错误码：{{ props.result.blockCode }}</p>
      </div>
    </div>

    <div v-if="props.loading" class="compliance-panel__skeleton">
      <div v-for="row in 4" :key="row" class="compliance-panel__skeleton-row" />
    </div>

    <p v-else-if="!props.result" class="compliance-panel__hint">选择患者后自动校验</p>

    <ul v-else class="compliance-panel__list">
      <li
        v-for="item in props.result.items"
        :key="item.key"
        class="compliance-panel__item"
        :class="{ 'compliance-panel__item--fail': !item.passed }"
      >
        <span
          class="compliance-panel__icon"
          :class="item.passed ? 'compliance-panel__icon--pass' : 'compliance-panel__icon--fail'"
          aria-hidden="true"
        >
          {{ item.passed ? '✓' : '✕' }}
        </span>
        <div class="compliance-panel__body">
          <p class="compliance-panel__label">{{ item.label }}</p>
          <p class="compliance-panel__detail">{{ item.detail }}</p>
        </div>
        <span class="compliance-panel__state">{{ item.passed ? '已通过' : '未通过' }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.compliance-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

/* 阻断条：红底红字，但底色只取 10% 浓度，避免整块面板过重 */
.compliance-panel__blocked {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border: 1px solid color-mix(in srgb, var(--status-danger) 40%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--status-danger) 10%, transparent);
  color: var(--status-danger);
}

.compliance-panel__blocked-icon {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--status-danger);
  color: var(--color-bg-container);
  font-size: var(--font-size-xs);
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.compliance-panel__blocked-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.compliance-panel__blocked-title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 600;
}

.compliance-panel__blocked-code {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.compliance-panel__hint {
  margin: 0;
  padding: var(--spacing-md);
  border-radius: var(--radius-sm);
  background: var(--color-bg-muted);
  font-size: var(--font-size-base);
  color: var(--color-text-tertiary);
}

.compliance-panel__list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.compliance-panel__item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-bg-container);
}

/* 未通过行整行浅红底：视线沿左侧图标扫下来时能立刻定位问题项 */
.compliance-panel__item--fail {
  border-color: color-mix(in srgb, var(--status-danger) 30%, transparent);
  background: color-mix(in srgb, var(--status-danger) 12%, transparent);
}

.compliance-panel__icon {
  flex: none;
  width: 16px;
  font-size: var(--font-size-base);
  font-weight: 700;
  line-height: 1.5;
  text-align: center;
}

.compliance-panel__icon--pass {
  color: var(--status-active);
}

.compliance-panel__icon--fail {
  color: var(--status-danger);
}

.compliance-panel__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 0;
}

.compliance-panel__label {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--color-text-primary);
}

.compliance-panel__detail {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.compliance-panel__state {
  flex: none;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.compliance-panel__item--fail .compliance-panel__state {
  color: var(--status-danger);
}

.compliance-panel__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* 骨架高度对齐真实条目（图标行 + 两行文字），加载完成时面板不跳高 */
.compliance-panel__skeleton-row {
  height: 56px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-muted);
  animation: compliance-panel-pulse 1.2s ease-in-out infinite;
}

@keyframes compliance-panel-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }
}
</style>
