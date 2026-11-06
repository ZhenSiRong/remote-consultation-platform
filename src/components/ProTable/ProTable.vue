<script setup lang="ts">
import { computed } from 'vue'
import type { ProTableColumn } from './types'
import { EMPTY_TEXT } from '@/utils/format'

/**
 * 列表页三件套：搜索行 + 表格 + 分页（README 3.2 / K-17）。
 * 本步只出空壳：props 定好、结构就位，虚拟滚动、列冻结、行内编辑由 K-17/K-18 补全。
 */
const props = withDefaults(
  defineProps<{
    columns: ProTableColumn[]
    rows?: Array<Record<string, string | number | null>>
    loading?: boolean
    total?: number
    page?: number
    pageSize?: number
  }>(),
  { rows: () => [], loading: false, total: 0, page: 1, pageSize: 20 },
)

const isEmpty = computed(() => !props.loading && props.rows.length === 0)
</script>

<template>
  <div class="pro-table">
    <div class="pro-table__search">
      <slot name="search" />
    </div>

    <table class="pro-table__table">
      <thead>
        <tr>
          <th v-for="col in props.columns" :key="col.key" :style="{ width: col.width ? `${col.width}px` : undefined }">
            {{ col.title }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in props.rows" :key="rowIndex">
          <td v-for="col in props.columns" :key="col.key" :style="{ textAlign: col.align ?? 'left' }">
            <slot name="cell" :row="row" :column="col">{{ row[col.key] ?? EMPTY_TEXT }}</slot>
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="props.loading" class="pro-table__state">加载中…</p>
    <p v-else-if="isEmpty" class="pro-table__state">暂无数据</p>

    <div class="pro-table__pager">
      共 {{ props.total }} 条 · 第 {{ props.page }} 页 · 每页 {{ props.pageSize }} 条
    </div>
  </div>
</template>

<style scoped>
.pro-table {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.pro-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-base);
}

.pro-table__table th,
.pro-table__table td {
  padding: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.pro-table__table th {
  background: var(--color-bg-table-header);
  font-weight: 600;
}

.pro-table__state {
  margin: 0;
  padding: var(--spacing-md);
  color: var(--color-text-secondary);
  text-align: center;
}

.pro-table__pager {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-align: right;
}
</style>
