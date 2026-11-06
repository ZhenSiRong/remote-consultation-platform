<script setup lang="ts">
import { RouterLink } from 'vue-router'

/** 404 页（K-22 完善：迁入 DefaultLayout 内渲染并保留导航）。 */
</script>

<template>
  <section class="not-found">
    <h1 class="not-found__title">页面不存在</h1>
    <p class="not-found__hint">请检查地址，或返回工作台。</p>
    <RouterLink class="not-found__link" to="/dashboard">返回工作台</RouterLink>
  </section>
</template>

<style scoped>
.not-found {
  padding: var(--spacing-lg);
}

.not-found__title {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-xl);
}

.not-found__hint {
  margin: 0 0 var(--spacing-md);
  color: var(--color-text-secondary);
}

.not-found__link {
  color: var(--color-primary);
}
</style>
