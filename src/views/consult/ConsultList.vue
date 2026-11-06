<script setup lang="ts">
/**
 * 会诊工单列表页（C-01 落地）。
 * 列表页三件套：搜索 + 表格 + 分页（README 3.2）。
 * TODO(C-01)：状态标签页、多字段搜索行、ProTable、脱敏患者列。
 */
</script>

<template>
  <section class="consult-list">
    <h1 class="consult-list__title">会诊工单</h1>
    <p class="consult-list__hint">列表骨架待 C-01 实现（ProTable + StatusTag）。</p>
  </section>
</template>

<style scoped>
.consult-list__title {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-xl);
}

.consult-list__hint {
  margin: 0;
  color: var(--color-text-secondary);
}
</style>
