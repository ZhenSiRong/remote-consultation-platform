<script setup lang="ts">
/**
 * 详情页卡片容器（README 3.2 / K-19）。
 *
 * 详情页是"多块信息纵向堆叠"，所以统一容器：标题（左侧 3px 主色竖条）+ 右上操作区
 * + 内容区 + 可选底栏。把间距、圆角、阴影收在这里，页面只关心塞什么内容。
 */
interface Props {
  title?: string
  /** 是否显示描边，默认 true */
  bordered?: boolean
}

const props = withDefaults(defineProps<Props>(), { title: '', bordered: true })
</script>

<template>
  <section class="page-card" :class="{ 'page-card--bordered': props.bordered }">
    <header v-if="props.title || $slots.extra" class="page-card__header">
      <h2 class="page-card__title">
        <span v-if="props.title" class="page-card__bar" aria-hidden="true" />
        {{ props.title }}
      </h2>
      <div class="page-card__extra">
        <slot name="extra" />
      </div>
    </header>

    <div class="page-card__body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="page-card__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.page-card {
  padding: var(--spacing-lg);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
  box-shadow: var(--shadow-sm);
}

.page-card--bordered {
  border-color: var(--color-border-light);
}

.page-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.page-card__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text-primary);
}

.page-card__bar {
  width: 3px;
  height: 16px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
}

.page-card__extra {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.page-card__footer {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--color-border-light);
}
</style>
