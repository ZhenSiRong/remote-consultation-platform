<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ERROR_CODES } from '@rcp/shared'
import type { ConsultOrder } from '@/api/types'
import { ApiError } from '@/api/request'
import { fetchConsultDetail, fetchDictionaries } from '@/api/consult'
import type { ConsultDictionaries, DictDoctor } from '@/api/consult'
import { CONSULT_STATUS_META } from '@/domain/consult/stateMachine'
import { DateTimeText } from '@/components/DateTimeText'
import { EmptyState } from '@/components/EmptyState'
import { PageCard } from '@/components/PageCard'
import { StatusTag } from '@/components/StatusTag'
import ConsultActionBar from '@/components/consult/ConsultActionBar.vue'

/**
 * 会诊工单详情（C-05）+ 动作条（C-06）。
 *
 * 页面只做三件事：拉详情、按 tab 铺只读信息、把动作条的两种结果接住。
 * 状态怎么变、哪些按钮能点，一律交给状态机与动作条，页面不复制流转表——
 * 否则「页面认为能点、后端认为非法」的分歧会直接暴露在演示里。
 *
 * 失败处理刻意不弹 Message：统一在页面顶部出一条红条。
 * 红条只负责「告知」，状态正确性由重新拉取保证（见 handleFailed）。
 */
const route = useRoute()
const router = useRouter()

/** 路由参数 id；用 computed 而不是一次性取值，方便后续同页切换工单 */
const orderId = computed(() => String(route.params.id ?? ''))

const detail = ref<ConsultOrder | null>(null)
const loading = ref(false)
const loadError = ref('')
const activeTab = ref('overview')

const GENDER_LABEL: Record<ConsultOrder['patient']['gender'], string> = {
  MALE: '男',
  FEMALE: '女',
  UNKNOWN: '未知',
}

/**
 * 拉详情。
 * silent = true 用于动作完成/失败后的校正刷新：不切换整页骨架、不清空已展示内容，
 * 用户视线不会被打断，但页面状态仍以后端返回为准。
 */
async function load(options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) {
    loading.value = true
  }
  loadError.value = ''
  try {
    detail.value = await fetchConsultDetail(orderId.value)
  } catch (error) {
    // 静默刷新失败不覆盖已展示内容：正在看的工单还在，白屏比缺少一次刷新更糟
    if (!options.silent) {
      loadError.value = error instanceof ApiError ? error.message : '加载失败，请稍后重试'
    }
  } finally {
    if (!options.silent) {
      loading.value = false
    }
  }
}

/**
 * 字典（机构 / 医生）只用于把工单里的裸 ID 翻成名称，不是页面的数据源：
 * 拉取失败时页面照常渲染、ID 原样显示，不能让「翻译不了」升级成「详情打不开」。
 */
const dictionaries = ref<ConsultDictionaries | null>(null)

async function loadDictionaries(): Promise<void> {
  try {
    dictionaries.value = await fetchDictionaries()
  } catch {
    // 静默失败：翻译函数会回落显示 ID，页面上不需要多一条错误提示
    dictionaries.value = null
  }
}

const orgNameById = computed<Map<string, string>>(
  () => new Map((dictionaries.value?.orgs ?? []).map((org) => [org.id, org.name])),
)

const doctorById = computed<Map<string, DictDoctor>>(
  () => new Map((dictionaries.value?.doctors ?? []).map((doctor) => [doctor.id, doctor])),
)

/** 翻译结果带命中标记：未命中要在 title 里说明，不能伪装成正常名称 */
interface ResolvedName {
  text: string
  hit: boolean
}

/** 机构：null 表示「未指定受邀机构」，属于无数据，要和「字典里查不到」区分开 */
function resolveOrg(id: string | null): ResolvedName {
  if (!id) return { text: '—', hit: true }
  const name = orgNameById.value.get(id)
  return name ? { text: name, hit: true } : { text: id, hit: false }
}

/** 医生：命中时带职称；未命中回落 ID 本身（不能显示 `—`，那会被读成「没有这个人」） */
function resolveDoctor(id: string): ResolvedName {
  const doctor = doctorById.value.get(id)
  if (!doctor) return { text: id, hit: false }
  return { text: doctor.title ? `${doctor.name}（${doctor.title}）` : doctor.name, hit: true }
}

/** 发起人来自 usr-* 命名空间，通常不在医生字典里；未命中就显示原 ID */
const creator = computed<ResolvedName>(() =>
  detail.value ? resolveDoctor(detail.value.createdBy) : { text: '—', hit: true },
)

const invitedOrg = computed<ResolvedName>(() =>
  detail.value ? resolveOrg(detail.value.invitedOrgId) : { text: '—', hit: true },
)

const invitedDoctors = computed<ResolvedName[]>(() =>
  detail.value ? detail.value.invitedDoctorIds.map(resolveDoctor) : [],
)

/** 只要有一个没命中就整串标注：避免部分 ID 混在名称里被当成正常名称读过去 */
const invitedDoctorsHit = computed(() => invitedDoctors.value.every((item) => item.hit))

/** 失败提示条 */
interface FailureBanner {
  code: number
  message: string
  traceId: string
}

const banner = ref<FailureBanner | null>(null)

/** 红条 5 秒自动消失；可手动关闭 */
const BANNER_DURATION_MS = 5_000
let bannerTimer: ReturnType<typeof setTimeout> | null = null

function clearBannerTimer(): void {
  if (bannerTimer !== null) {
    clearTimeout(bannerTimer)
    bannerTimer = null
  }
}

function dismissBanner(): void {
  clearBannerTimer()
  banner.value = null
}

/**
 * 20005 是演示里唯一需要「人话」的错误：错误码本身没有信息量，
 * 用户真正要知道的是「当前状态不允许这个操作」，以及找后端排查时的 traceId。
 * 其余错误沿用后端 message，不臆造文案。
 */
const bannerText = computed(() => {
  const value = banner.value
  if (!value) return ''
  const head =
    value.code === ERROR_CODES.ILLEGAL_STATE_TRANSITION
      ? `非法流转（错误码 ${value.code}）：当前状态不允许执行该操作`
      : `操作失败（错误码 ${value.code}）：${value.message}`
  return value.traceId ? `${head} [traceId: ${value.traceId}]` : head
})

function showBanner(payload: FailureBanner): void {
  clearBannerTimer()
  banner.value = payload
  bannerTimer = setTimeout(() => {
    banner.value = null
    bannerTimer = null
  }, BANNER_DURATION_MS)
}

/** 动作成功：先用后端返回的工单替换本地状态（按钮与色点立刻更新），再静默校正一次 */
function handleDone(next: ConsultOrder): void {
  detail.value = next
  dismissBanner()
  void load({ silent: true })
}

/**
 * 动作失败：先亮红条，再重新拉详情。
 * 「状态不得回滚」的落地方式就是这一句刷新——本地不做任何乐观修改，
 * 页面最终展示的一定是后端当前状态，而不是用户以为的状态。
 */
function handleFailed(payload: FailureBanner): void {
  showBanner(payload)
  void load({ silent: true })
}

/** 流转记录节点类型，与 el-timeline-item 的 type 取值对齐 */
type TimelineNodeType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

interface TimelineNode {
  key: string
  label: string
  time: string
  type: TimelineNodeType
}

/**
 * 流转记录：按 4 个时间戳中有值的节点渲染，标题取状态字典的中文名。
 * 不额外造一份「动作名」表——状态名就是用户能理解的节点名，
 * 而且能保证和页头 StatusTag 用的是同一套文案。
 */
const timelineNodes = computed<TimelineNode[]>(() => {
  const order = detail.value
  if (!order) return []

  const nodes: TimelineNode[] = [
    {
      key: 'createdAt',
      label: CONSULT_STATUS_META.PENDING_ACCEPT.label,
      time: order.createdAt,
      type: 'info',
    },
  ]

  if (order.scheduledAt) {
    nodes.push({
      key: 'scheduledAt',
      label: CONSULT_STATUS_META.SCHEDULED.label,
      time: order.scheduledAt,
      type: 'warning',
    })
  }

  if (order.startedAt) {
    nodes.push({
      key: 'startedAt',
      label: CONSULT_STATUS_META.IN_PROGRESS.label,
      time: order.startedAt,
      type: 'primary',
    })
  }

  if (order.endedAt) {
    nodes.push({
      key: 'endedAt',
      label: CONSULT_STATUS_META[order.status].label,
      time: order.endedAt,
      type: order.status === 'VOIDED' ? 'danger' : 'success',
    })
  }

  return nodes
})

onMounted(() => {
  // 详情与字典互不依赖，并行拉：字典慢/失败都不拖住详情首屏
  void load()
  void loadDictionaries()
})

// 组件销毁时必须清掉定时器，否则离开页面后仍会写已卸载的 ref
onBeforeUnmount(clearBannerTimer)
</script>

<template>
  <section class="consult-detail">
    <el-skeleton v-if="loading && !detail" class="consult-detail__skeleton" :rows="8" animated />

    <EmptyState
      v-else-if="loadError && !detail"
      type="error"
      title="加载失败"
      :description="loadError"
      action-text="重新加载"
      @action="load"
    />

    <template v-else-if="detail">
      <div v-if="banner" class="consult-detail__error" role="alert">
        <span class="consult-detail__error-text">{{ bannerText }}</span>
        <button
          class="consult-detail__error-close"
          type="button"
          aria-label="关闭提示"
          @click="dismissBanner"
        >
          ×
        </button>
      </div>

      <header class="consult-detail__header">
        <el-button class="consult-detail__back" link @click="router.back()">返回</el-button>
        <h1 class="consult-detail__title">
          会诊单
          <span class="consult-detail__no">{{ detail.orderNo }}</span>
        </h1>
        <StatusTag :status="detail.status" size="default" />
        <ConsultActionBar
          class="consult-detail__actions"
          :order="detail"
          :loading="loading"
          @done="handleDone"
          @failed="handleFailed"
        />
      </header>

      <el-tabs v-model="activeTab" class="consult-detail__tabs">
        <el-tab-pane label="概览" name="overview">
          <div class="consult-detail__stack">
            <PageCard title="基本信息">
              <dl class="info-list">
                <div class="info-list__row">
                  <dt>科室</dt>
                  <dd>{{ detail.departmentName }}</dd>
                </div>
                <div class="info-list__row">
                  <dt>发起人</dt>
                  <!-- 命中字典显示姓名，未命中保留原 ID：`—` 表示「无数据」，用在这里会误导 -->
                  <dd
                    :class="{ 'info-list__mono': !creator.hit }"
                    :title="creator.hit ? undefined : '名称未命中字典'"
                  >
                    {{ creator.text }}
                  </dd>
                </div>
                <div class="info-list__row">
                  <dt>发起时间</dt>
                  <dd><DateTimeText :value="detail.createdAt" mode="datetime" /></dd>
                </div>
                <div class="info-list__row">
                  <dt>是否代发起</dt>
                  <dd>{{ detail.createdOnBehalf ? '是（协调员代发起）' : '否' }}</dd>
                </div>
                <div class="info-list__row info-list__row--full">
                  <dt>会诊目的</dt>
                  <dd>{{ detail.consultPurpose }}</dd>
                </div>
                <div class="info-list__row info-list__row--full">
                  <dt>主诉</dt>
                  <dd>{{ detail.chiefComplaint || '—' }}</dd>
                </div>
                <div class="info-list__row info-list__row--full">
                  <dt>诊断摘要</dt>
                  <dd>{{ detail.diagnosisSummary || '—' }}</dd>
                </div>
              </dl>
            </PageCard>

            <PageCard title="受邀方">
              <dl class="info-list">
                <div class="info-list__row">
                  <dt>受邀机构</dt>
                  <dd :title="invitedOrg.hit ? undefined : '名称未命中字典'">{{ invitedOrg.text }}</dd>
                </div>
                <div class="info-list__row">
                  <dt>排期时间</dt>
                  <dd><DateTimeText :value="detail.scheduledAt" mode="datetime" /></dd>
                </div>
                <div class="info-list__row info-list__row--full">
                  <dt>受邀医生</dt>
                  <dd
                    v-if="invitedDoctors.length"
                    :title="invitedDoctorsHit ? undefined : '名称未命中字典'"
                  >
                    {{ invitedDoctors.map((doctor) => doctor.text).join('、') }}
                  </dd>
                  <dd v-else>—</dd>
                </div>
              </dl>
            </PageCard>
          </div>
        </el-tab-pane>

        <el-tab-pane label="患者" name="patient">
          <PageCard title="患者信息">
            <dl class="info-list">
              <!-- 患者字段在契约里就是脱敏态（patientBriefSchema 的 *Masked 字段），
                   直接渲染即可；再套一层 MaskedText 属于二次脱敏，会掩盖「后端已脱敏」这个事实 -->
              <div class="info-list__row">
                <dt>姓名</dt>
                <dd class="consult-detail__masked" title="已脱敏（R8）">
                  {{ detail.patient.nameMasked }}
                </dd>
              </div>
              <div class="info-list__row">
                <dt>性别</dt>
                <dd>{{ GENDER_LABEL[detail.patient.gender] }}</dd>
              </div>
              <div class="info-list__row">
                <dt>年龄</dt>
                <dd>{{ detail.patient.age }} 岁</dd>
              </div>
              <div class="info-list__row">
                <dt>住院号</dt>
                <dd class="consult-detail__masked" title="已脱敏（R8）">
                  {{ detail.patient.inpatientNoMasked || '—' }}
                </dd>
              </div>
              <div class="info-list__row">
                <dt>证件号</dt>
                <dd class="consult-detail__masked" title="已脱敏（R8）">
                  {{ detail.patient.idCardMasked || '—' }}
                </dd>
              </div>
            </dl>
            <p class="consult-detail__mask-tip">姓名、住院号、证件号均为脱敏展示，原文仅后端持有（R8）。</p>
          </PageCard>
        </el-tab-pane>

        <el-tab-pane label="会诊资料" name="materials">
          <PageCard title="病情资料">
            <div class="consult-detail__stack">
              <section class="consult-detail__block">
                <h3 class="consult-detail__block-title">主诉</h3>
                <p class="consult-detail__block-text">{{ detail.chiefComplaint || '—' }}</p>
              </section>
              <section class="consult-detail__block">
                <h3 class="consult-detail__block-title">诊断摘要</h3>
                <p class="consult-detail__block-text">{{ detail.diagnosisSummary || '—' }}</p>
              </section>
            </div>
            <div class="consult-detail__dicom">影像资料待接入（DICOM port）</div>
          </PageCard>
        </el-tab-pane>

        <el-tab-pane label="流转记录" name="timeline">
          <PageCard title="流转记录">
            <el-timeline class="consult-detail__timeline">
              <el-timeline-item
                v-for="node in timelineNodes"
                :key="node.key"
                :type="node.type"
                :data-node="node.key"
              >
                <div class="timeline-node">
                  <span class="timeline-node__label">{{ node.label }}</span>
                  <DateTimeText class="timeline-node__time" :value="node.time" mode="datetime" />
                </div>
              </el-timeline-item>
            </el-timeline>
          </PageCard>
        </el-tab-pane>

        <el-tab-pane label="留痕" name="audit">
          <PageCard title="操作留痕">
            <EmptyState
              type="empty"
              title="审计日志将在 W9 接入（R9 留痕）"
              description="留痕列表、检索与导出功能开发中"
            />
          </PageCard>
        </el-tab-pane>
      </el-tabs>
    </template>
  </section>
</template>

<style scoped>
.consult-detail {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.consult-detail__skeleton {
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
}

/* 红条：失败信息常驻页顶，5 秒后由脚本收起，也可手动关 */
.consult-detail__error {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  border: 1px solid var(--status-danger);
  border-radius: var(--radius-sm);
  background: var(--color-bg-container);
  background: color-mix(in srgb, var(--status-danger) 10%, var(--color-bg-container));
  color: var(--status-danger);
  font-size: var(--font-size-base);
}

.consult-detail__error-text {
  flex: 1;
  word-break: break-all;
}

.consult-detail__error-close {
  flex: none;
  padding: 0 var(--spacing-xs);
  border: none;
  background: transparent;
  color: inherit;
  font-size: var(--font-size-lg);
  line-height: 1;
  cursor: pointer;
}

.consult-detail__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-sm);
}

.consult-detail__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--color-text-primary);
}

.consult-detail__no {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: var(--font-size-lg);
  font-weight: 400;
  color: var(--color-text-secondary);
}

/* 动作条推到最右，与左侧标题形成「看什么 / 能做什么」的两端布局 */
.consult-detail__actions {
  margin-left: auto;
}

.consult-detail__tabs {
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
  box-shadow: var(--shadow-sm);
}

.consult-detail__stack {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.info-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-md) var(--spacing-xl);
  margin: 0;
}

.info-list__row {
  display: flex;
  gap: var(--spacing-sm);
  min-width: 0;
}

.info-list__row--full {
  grid-column: 1 / -1;
}

.info-list dt {
  flex: none;
  width: 84px;
  color: var(--color-text-tertiary);
}

.info-list dd {
  min-width: 0;
  margin: 0;
  color: var(--color-text-primary);
  word-break: break-word;
  white-space: pre-wrap;
}

/* 主键 / 单号类字段等宽，便于逐位比对 */
.info-list__mono {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
}

/* 已脱敏字段用等宽数字：掩码里的 * 与原文占位等宽，切换工单时不会左右跳动 */
.consult-detail__masked {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.consult-detail__mask-tip {
  margin: var(--spacing-lg) 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.consult-detail__block-title {
  margin: 0 0 var(--spacing-xs);
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.consult-detail__block-text {
  margin: 0;
  padding: var(--spacing-md);
  border-radius: var(--radius-sm);
  background: var(--color-bg-muted);
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 影像未接入：虚线空槽表达「预留位」，不用空态插画，避免误读成加载失败 */
.consult-detail__dicom {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-xl);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-base);
  text-align: center;
}

.consult-detail__timeline {
  padding-left: var(--spacing-xs);
}

.timeline-node {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--spacing-sm);
}

.timeline-node__label {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text-primary);
}

.timeline-node__time {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}
</style>
