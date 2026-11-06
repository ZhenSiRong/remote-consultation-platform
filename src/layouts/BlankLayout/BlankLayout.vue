<script setup lang="ts">
/**
 * 无壳布局：登录页等（README 3.4）。只有居中容器 + 插槽，不含导航与状态栏。
 */
</script>

<template>
  <div class="blank-layout">
    <div class="blank-layout__inner">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.blank-layout {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--spacing-lg);
  background: var(--color-bg-page);
}

.blank-layout__inner {
  width: 100%;
  max-width: 420px;
}
</style>
