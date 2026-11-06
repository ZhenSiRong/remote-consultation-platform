<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import logoUrl from '@/assets/logo.svg'

/**
 * 四层骨架（README 3.1）：① 顶部栏 ② 左侧导航 ③ 主内容区 ④ 底部状态栏。
 * 本文件只负责骨架与插槽；色值一律引用 token（K-02 落地），不写裸色值。
 * TODO(K-10/K-21)：导航由权限点生成、机构切换、状态栏实时数据。
 */
interface NavItem {
  title: string
  to: string
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  { title: '工作台', items: [{ title: '首页', to: '/dashboard' }] },
  { title: '会诊业务', items: [{ title: '会诊工单', to: '/consult' }] },
  { title: '病历与记录', items: [{ title: '病历共享', to: '/emr' }, { title: '会诊记录', to: '/record' }] },
  { title: '合规审计', items: [{ title: '审计日志', to: '/audit' }] },
]
</script>

<template>
  <div class="layout">
    <!-- ① 顶部栏：logo · 机构名 · 当前用户 · 消息入口 · 机构切换 -->
    <header class="layout__header">
      <div class="layout__brand">
        <img class="layout__logo" :src="logoUrl" alt="远程会诊平台" />
        <span class="layout__title">远程会诊平台</span>
      </div>
      <div class="layout__org">机构：未选择</div>
      <div class="layout__spacer" />
      <div class="layout__user">未登录</div>
    </header>

    <div class="layout__body">
      <!-- ② 左侧导航：按业务域分组 -->
      <aside class="layout__sider">
        <nav v-for="group in navGroups" :key="group.title" class="layout__nav-group">
          <p class="layout__nav-group-title">{{ group.title }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            class="layout__nav-item"
            :to="item.to"
          >
            {{ item.title }}
          </RouterLink>
        </nav>
      </aside>

      <!-- ③ 主内容区：路由出口 -->
      <main class="layout__main">
        <slot>
          <RouterView />
        </slot>
      </main>
    </div>

    <!-- ④ 底部状态栏：当前患者 · 科室 · 时间 · 版本 -->
    <footer class="layout__footer">
      <span>当前患者：—</span>
      <span>科室：—</span>
      <span>版本：v0.1.0</span>
    </footer>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.layout__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex: 0 0 var(--layout-header-h);
  padding: 0 var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-container);
}

.layout__brand {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.layout__logo {
  width: 24px;
  height: 24px;
}

.layout__title {
  font-size: var(--font-size-lg);
  font-weight: 600;
}

.layout__spacer {
  flex: 1;
}

.layout__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.layout__sider {
  flex: 0 0 var(--layout-sider-w);
  overflow-y: auto;
  padding: var(--spacing-sm);
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-sider);
}

.layout__nav-group {
  margin: 0 0 var(--spacing-md);
}

.layout__nav-group-title {
  margin: 0 0 var(--spacing-xs);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.layout__nav-item {
  display: block;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  text-decoration: none;
}

.layout__nav-item:hover,
.layout__nav-item.router-link-active {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.layout__main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: var(--spacing-md);
  background: var(--color-bg-page);
}

.layout__footer {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  flex: 0 0 var(--layout-footer-h);
  padding: 0 var(--spacing-md);
  border-top: 1px solid var(--color-border);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  background: var(--color-bg-container);
}
</style>
