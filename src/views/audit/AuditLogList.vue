<script setup lang="ts">
/**
 * 合规审计域列表页（AuditLogList / AuthorizationList / OrgProtocolList，架构决策.md 3.1）。
 * TODO：审计日志按 traceId / 错误码检索。
 */
</script>

<template>
  <section class="audit-log-list">
    <h1 class="audit-log-list__title">审计日志</h1>
    <p class="audit-log-list__hint">留痕检索与授权清单待审计系列 story 实现。</p>
  </section>
</template>

<style scoped>
.audit-log-list__title {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-xl);
}

.audit-log-list__hint {
  margin: 0;
  color: var(--color-text-secondary);
}
</style>
