<script setup lang="ts">
/**
 * 工作台 / 首页：指标卡 + 待办 + 快捷入口（架构决策.md 3.1）。
 * TODO：指标卡数据接 api/consult.ts 与 store/modules/consult.ts。
 */
</script>

<template>
  <section class="dashboard">
    <h1 class="dashboard__title">工作台</h1>
    <p class="dashboard__hint">指标卡 / 待办 / 快捷入口待业务 story 填充。</p>
  </section>
</template>

<style scoped>
.dashboard__title {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-xl);
}

.dashboard__hint {
  margin: 0;
  color: var(--color-text-secondary);
}
</style>
