<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ProTableColumn } from './types'
import EmptyState from '../EmptyState/EmptyState.vue'
import { EMPTY_TEXT } from '@/utils/format'

/**
 * 列表页表格（README 3.2 / K-17）。
 *
 * 用原生 `<table>` + `el-pagination`，不引 vxe-table：本切片没有注册 vxe 的运行时，
 * 引进来只会在页面白屏。原生表格足够覆盖"斑马纹 + 排序 + 分页 + 单元格插槽"。
 *
 * 单元格渲染有三层，优先级从高到低：
 *   1. `#cell-{key}` 插槽 —— 需要塞 StatusTag / MaskedText 这类组件时用；
 *   2. `column.render(row)` —— 纯文本加工（拼接、单位、截断）；
 *   3. 原值 —— 空值统一 `—`。
 * 这样表格组件不认识任何业务组件，页面又能自由组合。
 */
type EmptyType = 'empty' | 'search' | 'error' | 'forbidden'

interface Props {
  columns: ProTableColumn[]
  rows?: Record<string, unknown>[]
  loading?: boolean
  total?: number
  /** 当前页，默认 1 */
  page?: number
  /** 每页条数，默认 10 */
  pageSize?: number
  /** 行点击是否高亮，默认 true */
  rowClickable?: boolean
  /** 空态类型，默认 'empty' */
  emptyType?: EmptyType
  /** 行唯一键字段，默认 'id' */
  rowKey?: string
}

const props = withDefaults(defineProps<Props>(), {
  rows: () => [],
  loading: false,
  total: 0,
  page: 1,
  pageSize: 10,
  rowClickable: true,
  emptyType: 'empty',
  rowKey: 'id',
})

const emit = defineEmits<{
  'row-click': [row: Record<string, unknown>]
  'update:page': [page: number]
  'update:pageSize': [size: number]
  sort: [key: string, order: 'asc' | 'desc' | null]
}>()

const sortKey = ref<string | null>(null)
const sortOrder = ref<'asc' | 'desc' | null>(null)
const activeKey = ref<string | null>(null)

/** 加载中不算空态，否则首屏会闪一下"暂无数据" */
const isEmpty = computed(() => !props.loading && props.rows.length === 0)

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

const displayRows = computed<Record<string, unknown>[]>(() => {
  const key = sortKey.value
  const order = sortOrder.value
  if (!key || !order) return props.rows
  const factor = order === 'asc' ? 1 : -1
  return [...props.rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    // 空值恒沉底，不跟随升降序翻转，否则空行会在顶部堆积
    if (isBlank(av) || isBlank(bv)) {
      return isBlank(av) && isBlank(bv) ? 0 : isBlank(av) ? 1 : -1
    }
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
    return String(av).localeCompare(String(bv), 'zh-CN', { numeric: true }) * factor
  })
})

function cellValue(row: Record<string, unknown>, key: string): unknown {
  return row[key]
}

function renderCell(row: Record<string, unknown>, col: ProTableColumn): string {
  if (col.render) return col.render(row)
  const raw = row[col.key]
  return isBlank(raw) ? EMPTY_TEXT : String(raw)
}

function rowKeyOf(row: Record<string, unknown>, index: number): string {
  const raw = row[props.rowKey]
  return isBlank(raw) ? `row-${index}` : String(raw)
}

function colStyle(col: ProTableColumn): Record<string, string> {
  const style: Record<string, string> = { textAlign: col.align ?? 'left' }
  if (col.width !== undefined) style.width = typeof col.width === 'number' ? `${col.width}px` : col.width
  return style
}

/** 三态循环：升序 → 降序 → 取消，与 el-table 的交互习惯一致 */
function toggleSort(col: ProTableColumn): void {
  if (!col.sortable) return
  if (sortKey.value !== col.key) {
    sortKey.value = col.key
    sortOrder.value = 'asc'
  } else if (sortOrder.value === 'asc') {
    sortOrder.value = 'desc'
  } else {
    sortKey.value = null
    sortOrder.value = null
  }
  emit('sort', col.key, sortOrder.value)
}

function sortIcon(col: ProTableColumn): string {
  if (!col.sortable) return ''
  if (sortKey.value !== col.key || !sortOrder.value) return '↕'
  return sortOrder.value === 'asc' ? '↑' : '↓'
}

function ariaSort(col: ProTableColumn): 'ascending' | 'descending' | 'none' | undefined {
  if (!col.sortable) return undefined
  if (sortKey.value !== col.key || !sortOrder.value) return 'none'
  return sortOrder.value === 'asc' ? 'ascending' : 'descending'
}

function handleRowClick(row: Record<string, unknown>, index: number): void {
  if (!props.rowClickable) return
  activeKey.value = rowKeyOf(row, index)
  emit('row-click', row)
}

function handlePageChange(page: number): void {
  emit('update:page', page)
}

function handleSizeChange(size: number): void {
  emit('update:pageSize', size)
}
</script>

<template>
  <div class="pro-table">
    <div v-if="$slots.search" class="pro-table__search">
      <slot name="search" />
    </div>

    <!-- 加载态用顶部进度条，不用全屏遮罩：翻页时用户还要能看见上一页数据 -->
    <div v-if="props.loading" class="pro-table__progress" role="progressbar" aria-label="加载中">
      <span class="pro-table__progress-bar" />
    </div>

    <div class="pro-table__scroll">
      <table class="pro-table__table">
        <thead>
          <tr>
            <th
              v-for="col in props.columns"
              :key="col.key"
              class="pro-table__th"
              :class="{ 'pro-table__th--sortable': col.sortable }"
              :style="colStyle(col)"
              :aria-sort="ariaSort(col)"
              @click="toggleSort(col)"
            >
              <span class="pro-table__th-inner">
                {{ col.title }}
                <span v-if="col.sortable" class="pro-table__sort" aria-hidden="true">{{ sortIcon(col) }}</span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody v-if="displayRows.length > 0">
          <tr
            v-for="(row, index) in displayRows"
            :key="rowKeyOf(row, index)"
            class="pro-table__row"
            :class="{
              'pro-table__row--clickable': props.rowClickable,
              'pro-table__row--active': props.rowClickable && activeKey === rowKeyOf(row, index),
            }"
            @click="handleRowClick(row, index)"
          >
            <td v-for="col in props.columns" :key="col.key" class="pro-table__cell" :style="colStyle(col)">
              <slot :name="`cell-${col.key}`" :row="row" :value="cellValue(row, col.key)">
                {{ renderCell(row, col) }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <EmptyState v-if="isEmpty" class="pro-table__empty" :type="props.emptyType" />

    <div v-if="props.total > 0" class="pro-table__pagination">
      <el-pagination
        layout="total, sizes, prev, pager, next"
        :total="props.total"
        :current-page="props.page"
        :page-size="props.pageSize"
        :page-sizes="[10, 20, 50]"
        background
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>
  </div>
</template>

<style scoped>
.pro-table {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.pro-table__search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-sm);
}

.pro-table__progress {
  position: relative;
  height: 2px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-primary-bg);
}

.pro-table__progress-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 40%;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  animation: pro-table-progress 1.1s ease-in-out infinite;
}

@keyframes pro-table-progress {
  0% {
    left: -40%;
  }
  100% {
    left: 100%;
  }
}

/* 表格自身滚动：sticky 表头需要一个滚动容器，否则只会在视口里"粘住" */
.pro-table__scroll {
  max-height: 560px;
  overflow: auto;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
}

.pro-table__table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.pro-table__th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-page);
  color: var(--color-text-secondary);
  font-weight: 600;
  white-space: nowrap;
}

.pro-table__th--sortable {
  cursor: pointer;
  user-select: none;
}

.pro-table__th--sortable:hover {
  background: var(--color-bg-hover);
}

.pro-table__th-inner {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.pro-table__sort {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.pro-table__cell {
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border-light);
  vertical-align: middle;
}

/* 斑马纹：偶数行用页面底色，比加边框更轻 */
.pro-table__row:nth-child(even) {
  background: var(--color-bg-page);
}

.pro-table__row--clickable {
  cursor: pointer;
}

.pro-table__row:hover {
  background: var(--color-bg-hover);
}

.pro-table__row--active,
.pro-table__row--active:hover {
  background: var(--color-bg-active);
}

.pro-table__row:last-child .pro-table__cell {
  border-bottom: none;
}

.pro-table__empty {
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
}

.pro-table__pagination {
  display: flex;
  justify-content: flex-end;
}
</style>
