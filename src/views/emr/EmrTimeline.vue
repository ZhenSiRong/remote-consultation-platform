<script setup lang="ts">
/**
 * 病历共享域入口（EmrTimeline / RecordSharePanel 的落位见 架构决策.md 3.1）。
 * TODO：授权调阅时间轴、共享快照面板（EMR 系列 story）。
 */
</script>

<template>
  <section class="emr">
    <h1 class="emr__title">病历共享</h1>
    <p class="emr__hint">调阅授权与时间轴待 EMR 系列 story 实现。</p>
  </section>
</template>

<style scoped>
.emr__title {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-xl);
}

.emr__hint {
  margin: 0;
  color: var(--color-text-secondary);
}
</style>
