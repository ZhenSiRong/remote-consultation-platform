<script setup lang="ts">
/**
 * 会诊记录域列表页（RecordList / RecordDetail / RecordSign，架构决策.md 3.1）。
 * TODO(R-01)：结构化记录列表、待签署筛选、归档状态。
 */
</script>

<template>
  <section class="record-list">
    <h1 class="record-list__title">会诊记录</h1>
    <p class="record-list__hint">记录列表与签署入口待 REC 系列 story 实现。</p>
  </section>
</template>

<style scoped>
.record-list__title {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-xl);
}

.record-list__hint {
  margin: 0;
  color: var(--color-text-secondary);
}
</style>
