<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ProTable, type ProTableColumn } from '@/components/ProTable'
import { StatusTag } from '@/components/StatusTag'
import { DateTimeText } from '@/components/DateTimeText'
import { fetchConsultCounts, fetchConsultList } from '@/api/consult'
import type { ConsultCounts } from '@/api/consult'
import { ApiError } from '@/api/request'
import type { ConsultOrder } from '@/api/types'

/**
 * 会诊工单列表（C-01）。
 *
 * 数据来源只有接口一处：列表和角标都从 `api/consult` 拉，组件内不留任何"假数据兜底"，
 * 否则演示时接口挂了页面还显示旧数据，反而更难判断问题在哪。
 *
 * 视图状态（页签 / 筛选 / 页码）用组件内 ref 管理，没有塞进 pinia：
 * 这些状态只服务这一屏，离开页面就该失效；store 一旦接管，还要额外处理"什么时候清空"。
 */

/** 页签只覆盖演示主线用到的 5 个口径，其余主态（已受理/排期/作废）不单独开页签 */
type TabKey = '' | 'PENDING_ACCEPT' | 'IN_PROGRESS' | 'PENDING_SIGN' | 'ARCHIVED'

interface TabItem {
  key: TabKey
  label: string
  /** 角标取数字段，与 ConsultCounts 一一对应 */
  countKey: keyof ConsultCounts
}

const TABS: TabItem[] = [
  { key: '', label: '全部', countKey: 'all' },
  { key: 'PENDING_ACCEPT', label: '待受理', countKey: 'pendingAccept' },
  { key: 'IN_PROGRESS', label: '进行中', countKey: 'inProgress' },
  { key: 'PENDING_SIGN', label: '待签署', countKey: 'pendingSign' },
  { key: 'ARCHIVED', label: '已归档', countKey: 'archived' },
]

/** 科室选项写死：本期没有科室字典接口，枚举值必须与 mock 种子数据保持一致，否则筛选恒为空 */
const DEPARTMENTS = ['心内科', '神经内科', '呼吸内科', '影像科', '肿瘤科']

/**
 * 性别编码 → 中文。
 * 契约里性别是 UPPER_SNAKE 编码（MALE/FEMALE/UNKNOWN），直接展示会把编码漏到界面上。
 */
const GENDER_LABEL: Record<ConsultOrder['patient']['gender'], string> = {
  MALE: '男',
  FEMALE: '女',
  UNKNOWN: '未知',
}

const router = useRouter()

const activeTab = ref<TabKey>('')
const filters = reactive({ patientName: '', departmentName: '', dateFrom: '', dateTo: '' })
const page = ref(1)
const pageSize = ref(10)

const rows = ref<ConsultOrder[]>([])
const total = ref(0)
const loading = ref(false)
const counts = ref<ConsultCounts | null>(null)

/**
 * 加载失败标记：空态要区分"搜不到"和"请求挂了"。
 * 两者都表现为 rows 为空，但用户该做的事完全不同——改条件 vs 重试。
 */
const loadFailed = ref(false)

/** 有没有生效中的筛选条件，决定空态文案走"无结果"还是"暂无数据" */
const hasFilter = computed(() => {
  const f = filters
  return Boolean(f.patientName.trim() || f.departmentName || f.dateFrom || f.dateTo)
})

/** 插槽里的 row 是 ProTable 的宽松类型，断言成实体后才能取嵌套的 patient */
function asOrder(row: Record<string, unknown>): ConsultOrder {
  return row as unknown as ConsultOrder
}

function countOf(key: keyof ConsultCounts): number {
  // 角标数字不能是空白：0 也要显示，否则用户会以为"这个页签没加载出来"
  return counts.value?.[key] ?? 0
}

async function loadList(): Promise<void> {
  loading.value = true
  loadFailed.value = false
  try {
    const result = await fetchConsultList({
      // 空串要显式转成 undefined：接口层按 undefined 剔除参数，空串会被序列化成 ?status=
      status: activeTab.value || undefined,
      patientName: filters.patientName.trim() || undefined,
      departmentName: filters.departmentName || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    rows.value = result.list
    total.value = result.total
  } catch (error) {
    // 失败必须清空列表：留着上一次的结果会让用户误以为筛选生效了
    rows.value = []
    total.value = 0
    loadFailed.value = true
    ElMessage.error(error instanceof ApiError ? error.message : '加载会诊工单失败')
  } finally {
    loading.value = false
  }
}

/**
 * 角标单独拉、单独失败。
 * 计数挂了不该连带列表一起报错——列表本身还能用，角标退化成 0 是更小的代价。
 */
async function loadCounts(): Promise<void> {
  try {
    counts.value = await fetchConsultCounts()
  } catch {
    counts.value = null
  }
}

function selectTab(key: TabKey): void {
  if (activeTab.value === key) {
    return
  }
  activeTab.value = key
  // 切页签必须回第 1 页：否则第 3 页切到只有 2 条数据的页签会请求到空区间
  page.value = 1
  void loadList()
}

function handleSearch(): void {
  page.value = 1
  void loadList()
}

function handleReset(): void {
  filters.patientName = ''
  filters.departmentName = ''
  filters.dateFrom = ''
  filters.dateTo = ''
  page.value = 1
  void loadList()
}

function handleRowClick(row: Record<string, unknown>): void {
  void router.push(`/consult/${asOrder(row).id}`)
}

/**
 * 翻页 / 换每页条数都会重新请求。
 * 用 watch 而不是在 ProTable 的 update 事件里处理，是因为 v-model 已经把值写回来了，
 * 事件里再请求会和 v-model 的更新顺序耦合。
 */
watch(page, () => {
  void loadList()
})

watch(pageSize, () => {
  // 换条数时页码必须回到 1，否则「第 3 页 × 50 条」会落在空区间；回 1 由 page 的 watch 触发请求
  if (page.value !== 1) {
    page.value = 1
    return
  }
  void loadList()
})

const columns: ProTableColumn[] = [
  { key: 'orderNo', title: '单号', width: 150 },
  { key: 'patient', title: '患者', width: 100 },
  {
    key: 'genderAge',
    title: '性别/年龄',
    width: 110,
    // 契约里性别和年龄是两个字段，列表要的是合在一起的一列，所以在这里拼
    render: (row) => {
      const patient = asOrder(row).patient
      return `${GENDER_LABEL[patient.gender]} / ${patient.age}`
    },
  },
  { key: 'departmentName', title: '科室', width: 110 },
  { key: 'consultPurpose', title: '会诊目的', width: 260 },
  { key: 'status', title: '状态', width: 110 },
  { key: 'createdAt', title: '创建时间', width: 140 },
]

onMounted(() => {
  void loadList()
  void loadCounts()
})
</script>

<template>
  <section class="consult-list">
    <!-- 顶部工具行：标题 + 主操作。主操作放右上角，是全站列表页的统一位置 -->
    <header class="consult-list__header">
      <h1 class="consult-list__title">会诊工单</h1>
      <el-button type="primary" @click="router.push('/consult/create')">发起会诊</el-button>
    </header>

    <!-- 页签自绘：el-tabs 的角标要额外挂插槽且样式受限，自绘更好控也更好断言 -->
    <nav class="consult-list__tabs" role="tablist" aria-label="按状态筛选工单">
      <button
        v-for="tab in TABS"
        :key="tab.key || 'all'"
        class="consult-tab"
        :class="{ 'consult-tab--active': activeTab === tab.key }"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        @click="selectTab(tab.key)"
      >
        <span class="consult-tab__label">{{ tab.label }}</span>
        <span class="consult-tab__badge">{{ countOf(tab.countKey) }}</span>
      </button>
    </nav>

    <ProTable
      :columns="columns"
      :rows="rows"
      :loading="loading"
      :total="total"
      v-model:page="page"
      v-model:page-size="pageSize"
      :empty-type="loadFailed ? 'error' : hasFilter ? 'search' : 'empty'"
      row-key="id"
      @row-click="handleRowClick"
    >
      <template #search>
        <el-input
          v-model="filters.patientName"
          class="consult-list__field"
          placeholder="患者姓名"
          clearable
          @keyup.enter="handleSearch"
        />
        <el-select
          v-model="filters.departmentName"
          class="consult-list__field"
          placeholder="科室"
          clearable
        >
          <el-option v-for="name in DEPARTMENTS" :key="name" :label="name" :value="name" />
        </el-select>
        <el-date-picker
          v-model="filters.dateFrom"
          class="consult-list__field"
          type="date"
          placeholder="开始日期"
          value-format="YYYY-MM-DD"
        />
        <el-date-picker
          v-model="filters.dateTo"
          class="consult-list__field"
          type="date"
          placeholder="结束日期"
          value-format="YYYY-MM-DD"
        />
        <el-button type="primary" @click="handleSearch">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </template>

      <template #cell-orderNo="{ row }">
        <span class="consult-list__order-no">{{ asOrder(row).orderNo }}</span>
      </template>

      <!--
        患者名直接用接口返回的 nameMasked：脱敏是后端（R8）的职责，字段到前端已经是「李*」形态。
        这里再套一层 MaskedText 属于语义错误——会把「后端脱敏」伪装成「前端脱敏」，
        真出泄露问题时反而查不出责任边界。
      -->
      <template #cell-patient="{ row }">
        <span class="consult-list__patient">{{ asOrder(row).patient.nameMasked }}</span>
      </template>

      <!-- 会诊目的可能很长，单行省略 + title 看全文，避免撑破列宽 -->
      <template #cell-consultPurpose="{ row }">
        <span class="consult-list__ellipsis" :title="asOrder(row).consultPurpose">
          {{ asOrder(row).consultPurpose }}
        </span>
      </template>

      <template #cell-status="{ row }">
        <StatusTag :status="asOrder(row).status" size="small" />
      </template>

      <template #cell-createdAt="{ row }">
        <DateTimeText :value="asOrder(row).createdAt" mode="relative" />
      </template>
    </ProTable>
  </section>
</template>

<style scoped>
.consult-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.consult-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.consult-list__title {
  margin: 0;
  font-size: var(--font-size-xl);
  color: var(--color-text-primary);
}

.consult-list__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border-light);
}

.consult-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  line-height: 1.6;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.consult-tab:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* 激活态用主色底 + 主色字：色块比下划线更显眼，5 个页签并排时一眼能看出当前口径 */
.consult-tab--active,
.consult-tab--active:hover {
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-weight: 600;
}

.consult-tab__badge {
  min-width: 20px;
  padding: 0 var(--spacing-xs);
  border-radius: var(--radius-full);
  background: var(--color-bg-hover);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

/* 激活页签的角标反色，避免浅主色底上再叠一层浅灰底看不清数字 */
.consult-tab--active .consult-tab__badge {
  background: var(--color-primary);
  color: var(--color-bg-container);
}

.consult-list__field {
  width: 180px;
}

.consult-list__order-no {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.consult-list__patient {
  white-space: nowrap;
}

/*
 * 省略必须落在带 max-width 的行内元素上：
 * ProTable 的表是 table-layout: auto，列宽只是建议值，靠 td 自身截断并不可靠。
 */
.consult-list__ellipsis {
  display: block;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
