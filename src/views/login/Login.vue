<script setup lang="ts">
/**
 * 登录页（K-20 落地）。归 BlankLayout + 表单形态（架构决策.md 3.1 四种页面形态注）。
 * TODO(K-20)：机构下拉 / 账号 / 密码 / 验证码 / 错误码区分提示 / 登录留痕。
 */
</script>

<template>
  <section class="login">
    <h1 class="login__title">远程会诊平台</h1>
    <p class="login__hint">登录表单待 K-20 实现</p>
  </section>
</template>

<style scoped>
.login {
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
}

.login__title {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-xl);
}

.login__hint {
  margin: 0;
  color: var(--color-text-secondary);
}
</style>
