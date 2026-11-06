<script setup lang="ts">
/**
 * 详情页卡片：标题 + 右上编辑入口 + 内容区/子表格（README 3.2 / K-19）。
 */
withDefaults(defineProps<{ title: string; editable?: boolean }>(), { editable: false })

const emit = defineEmits<{ (e: 'edit'): void }>()
</script>

<template>
  <section class="page-card">
    <header class="page-card__header">
      <h2 class="page-card__title">{{ title }}</h2>
      <button v-if="editable" class="page-card__edit" type="button" @click="emit('edit')">编辑</button>
    </header>
    <div class="page-card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.page-card {
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
}

.page-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}

.page-card__title {
  margin: 0;
  font-size: var(--font-size-lg);
}

.page-card__edit {
  border: none;
  background: none;
  color: var(--color-primary);
  cursor: pointer;
}
</style>
