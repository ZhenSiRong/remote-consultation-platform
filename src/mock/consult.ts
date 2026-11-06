import {
  ERROR_CODES,
  MAX_PAGE_SIZE,
  consultOrderSchema,
  createConsultationSchema,
  isConsultStatus,
} from '@rcp/shared'
import type { ConsultOrder, PageResult } from '@rcp/shared'
import {
  CONSULT_ACTION_META,
  CONSULT_STATUS_META,
  canTransition,
  type ConsultAction,
} from '@/domain/consult/stateMachine'
import type { ConsultCounts, PrecheckItem, PrecheckResult } from '@/api/consult'
import type { MockContext, MockReply, MockRoute } from './adapter'
import { SELF_ORG_ID, SEED_ORDERS, findPatient, getPatientName, toPatientBrief } from './fixtures'

/**
 * 会诊工单 mock 接口（6 个）。
 *
 * 两条红线：
 * 1. 状态流转只调 `canTransition` / `CONSULT_ACTION_META`（src/domain/consult/stateMachine.ts），
 *    这里绝不另写一份流转表。页面按钮可点性用的是同一张表，两边一旦各写一份，
 *    演示时就会出现「按钮能点、接口报 20005」这种最掉分的场景。
 * 2. 分页返回 `list` 不是 `items`（契约 PageResult），否则接真后端时所有列表页要改字段名。
 *
 * 内存数据刷新即重置，这是已知限制：本期不做持久化，演示时「改完刷新回到初始态」是可接受的。
 */

/** 当前登录医师（真后端取自会话，mock 固定一人） */
const CURRENT_DOCTOR_ID = 'doc-1001'
const CURRENT_USER_ID = 'usr-4001'

/**
 * 工单内存表：`let` + 数组原地改（unshift / 下标赋值），
 * 这样「建单、流转后返回列表能看到变化」才成立；换成不可变重建也不会错，
 * 但会让「哪里改了内存」变得难追。
 */
let orders: ConsultOrder[] = [...SEED_ORDERS]

/** 单号顺延游标：从种子条数 +1 开始，避免与 HZ20260001~0012 撞号 */
let nextSeq = SEED_ORDERS.length + 1

function padSeq(seq: number): string {
  return String(seq).padStart(4, '0')
}

/**
 * 当前时间 → ISO 8601 带 +08:00。
 * 不用 toISOString() 直接返回：契约样例是 `+08:00`，全站时间展示都按东八区，
 * 混进 `Z` 后缀会让页面上的时间格式化逻辑出现两套分支。
 */
function nowIso(): string {
  const beijing = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return beijing.toISOString().replace('Z', '+08:00')
}

/** 路径里的工单 id：'/consultations/:id' 与 '/consultations/:id/transition' 都取第 3 段 */
function pathId(path: string): string {
  return decodeURIComponent(path.split('/')[2] ?? '')
}

function ok(data: unknown): MockReply {
  return { code: ERROR_CODES.SUCCESS, message: 'ok', data }
}

function fail(code: number, message: string): MockReply {
  return { code, message, data: null }
}

/** query 里的整数：缺省/非法都回落到默认值，避免 NaN 污染分页 */
function readInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 按 createdAt 的日期部分比较（yyyy-MM-dd），带时区的时间串直接切前 10 位即可 */
function createdDate(order: ConsultOrder): string {
  return order.createdAt.slice(0, 10)
}

function filterOrders(query: MockContext['query']): ConsultOrder[] {
  const keyword = (query.patientName ?? '').trim()
  const department = (query.departmentName ?? '').trim()
  const status = query.status
  const dateFrom = query.dateFrom
  const dateTo = query.dateTo

  return orders.filter((order) => {
    if (status && isConsultStatus(status) && order.status !== status) {
      return false
    }
    if (department && !order.departmentName.includes(department)) {
      return false
    }
    if (keyword) {
      // 实体里只有脱敏名（李*），但演示时用户会输入全名（李建国），
      // 所以同时比对名录里的明文名——真实后端就是按明文模糊查的
      const plainName = getPatientName(order.patient.patientId) ?? ''
      if (!order.patient.nameMasked.includes(keyword) && !plainName.includes(keyword)) {
        return false
      }
    }
    const date = createdDate(order)
    if (dateFrom && date < dateFrom) {
      return false
    }
    if (dateTo && date > dateTo) {
      return false
    }
    return true
  })
}

function toCounts(): ConsultCounts {
  const counts: ConsultCounts = {
    all: orders.length,
    pendingAccept: 0,
    accepted: 0,
    scheduled: 0,
    inProgress: 0,
    pendingSign: 0,
    archived: 0,
    voided: 0,
  }

  // 实时从内存算，不维护第二份计数：建单/流转后页签角标必须立刻跟着变
  for (const order of orders) {
    switch (order.status) {
      case 'PENDING_ACCEPT':
        counts.pendingAccept += 1
        break
      case 'ACCEPTED':
        counts.accepted += 1
        break
      case 'SCHEDULED':
        counts.scheduled += 1
        break
      case 'IN_PROGRESS':
        counts.inProgress += 1
        break
      case 'PENDING_SIGN':
        counts.pendingSign += 1
        break
      case 'ARCHIVED':
        counts.archived += 1
        break
      case 'VOIDED':
        counts.voided += 1
        break
    }
  }

  return counts
}

function handleList(ctx: MockContext): MockReply {
  const page = Math.max(1, readInt(ctx.query.page, 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, readInt(ctx.query.pageSize, 20)))

  const filtered = filterOrders(ctx.query).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )

  const start = (page - 1) * pageSize
  const result: PageResult<ConsultOrder> = {
    list: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  }
  return ok(result)
}

function handleDetail(ctx: MockContext): MockReply {
  const id = pathId(ctx.path)
  const order = orders.find((item) => item.id === id)
  if (!order) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '资源不存在')
  }
  return ok(order)
}

function handleCreate(ctx: MockContext): MockReply {
  const parsed = createConsultationSchema.safeParse(ctx.body)
  if (!parsed.success) {
    // 只回第一条 issue：页面按 10001 的约定「定位到首个非法字段并提示」，多回反而没法定位
    return fail(ERROR_CODES.PARAM_INVALID, parsed.error.issues[0]?.message ?? '参数校验失败')
  }
  const input = parsed.data

  const patient = findPatient(input.patientId)
  if (!patient) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '资源不存在')
  }

  // R3：首诊不得开展互联网复诊会诊——这是本期唯一被要求拦下来的建单规则
  if (!patient.hasPriorVisit) {
    return fail(
      ERROR_CODES.FIRST_VISIT_BLOCKED,
      '该患者无本院就诊记录，首诊不得发起远程会诊',
    )
  }

  const seq = nextSeq
  nextSeq += 1
  const now = nowIso()

  const order: ConsultOrder = consultOrderSchema.parse({
    id: `ord-${padSeq(seq)}`,
    orderNo: `HZ2026${padSeq(seq)}`,
    orgId: SELF_ORG_ID,
    applicantOrgId: SELF_ORG_ID,
    invitedOrgId: input.invitedOrgId,
    patient: toPatientBrief(input.patientId, input.departmentName),
    departmentName: input.departmentName,
    consultPurpose: input.consultPurpose,
    chiefComplaint: input.chiefComplaint,
    diagnosisSummary: input.diagnosisSummary,
    status: 'PENDING_ACCEPT',
    flags: [],
    scheduledAt: input.scheduledAt ?? null,
    startedAt: null,
    endedAt: null,
    applicantDoctorId: CURRENT_DOCTOR_ID,
    invitedDoctorIds: input.invitedDoctorIds,
    createdBy: CURRENT_USER_ID,
    createdOnBehalf: input.createdOnBehalf,
    createdAt: now,
    updatedAt: now,
  })

  // 新单进队首：列表按 createdAt 倒序，用户建完立刻能看到自己刚发起的这条
  orders.unshift(order)
  return ok(order)
}

function isConsultAction(value: unknown): value is ConsultAction {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CONSULT_ACTION_META, value)
}

function handleTransition(ctx: MockContext): MockReply {
  const id = pathId(ctx.path)
  const order = orders.find((item) => item.id === id)
  if (!order) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '资源不存在')
  }

  const body = (ctx.body ?? {}) as { action?: unknown; reason?: unknown }
  const action = body.action
  if (!isConsultAction(action)) {
    return fail(ERROR_CODES.PARAM_INVALID, '未知的操作')
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (CONSULT_ACTION_META[action].requiresReason && !reason) {
    return fail(ERROR_CODES.PARAM_INVALID, '作废必须填写原因')
  }

  const target = canTransition(order.status, action)
  if (!target) {
    // 提示语带上当前状态与动作的中文名：用户看到的是「已归档不允许受理」，不是 20005
    const fromLabel = CONSULT_STATUS_META[order.status].label
    const actionLabel = CONSULT_ACTION_META[action].label
    return fail(
      ERROR_CODES.ILLEGAL_STATE_TRANSITION,
      `当前状态（${fromLabel}）不允许执行「${actionLabel}」`,
    )
  }

  const now = nowIso()
  const updated: ConsultOrder = consultOrderSchema.parse({
    ...order,
    status: target,
    // 时间戳只写与本次动作对应的那个：其余保持原值，避免「排期时间被开始时间覆盖」
    scheduledAt: action === 'SCHEDULE' ? now : order.scheduledAt,
    startedAt: action === 'START' ? now : order.startedAt,
    endedAt: action === 'FINISH' ? now : order.endedAt,
    updatedAt: now,
  })

  // 原地替换：列表/详情读的是同一个数组，改完立刻生效，不用重建数组
  orders = orders.map((item) => (item.id === updated.id ? updated : item))
  return ok(updated)
}

function handlePrecheck(ctx: MockContext): MockReply {
  const patientId = ctx.query.patientId
  if (!patientId) {
    return fail(ERROR_CODES.PARAM_INVALID, '缺少患者标识')
  }

  const patient = findPatient(patientId)
  if (!patient) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '资源不存在')
  }

  // 首诊患者：R3 拦截，落在「知情同意」这一项上（契约约定的固定 4 项之一）
  const firstVisit = !patient.hasPriorVisit

  const items: PrecheckItem[] = [
    {
      key: 'consent',
      label: '患者知情同意（R4）',
      passed: !firstVisit,
      detail: firstVisit
        ? '该患者无本院就诊记录，首诊不得开展远程会诊，请先转线下首诊'
        : '知情同意书已签署，同意范围覆盖本次会诊',
    },
    {
      key: 'orgProtocol',
      label: '受邀机构协议已签署（R1）',
      passed: true,
      detail: '《远程医疗服务协议》在有效期内',
    },
    {
      key: 'practiceScope',
      label: '医师执业范围匹配（R5）',
      passed: true,
      detail: '申请医师执业范围覆盖本次会诊科目',
    },
    {
      key: 'signatureCert',
      label: '电子签名证书有效（R6）',
      passed: true,
      detail: 'CA 证书有效，可正常签署会诊记录',
    },
  ]

  const result: PrecheckResult = firstVisit
    ? { items, blocked: true, blockCode: ERROR_CODES.FIRST_VISIT_BLOCKED }
    : { items, blocked: false }

  return ok(result)
}

/**
 * 路由表。
 * 顺序按「精确路径在前、带 :id 的在后」排：adapter 虽然会先做精确匹配，
 * 但这里也保持人类可读的顺序，避免以后换匹配实现时踩 counts 被当成 id 的坑。
 */
export const consultRoutes: MockRoute[] = [
  { method: 'GET', pattern: '/consultations', handler: handleList },
  { method: 'GET', pattern: '/consultations/counts', handler: () => ok(toCounts()) },
  { method: 'GET', pattern: '/consultations/precheck', handler: handlePrecheck },
  { method: 'POST', pattern: '/consultations', handler: handleCreate },
  { method: 'GET', pattern: '/consultations/:id', handler: handleDetail },
  { method: 'POST', pattern: '/consultations/:id/transition', handler: handleTransition },
]
