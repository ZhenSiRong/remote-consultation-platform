import { httpGet, httpPost } from './request'
import type { ConsultOrder, ConsultStatus, CreateConsultationRequest, PageResult } from './types'
import type { ConsultAction } from '@/domain/consult/stateMachine'

/**
 * 会诊工单接口（协议层，不含业务判断）。
 *
 * 为什么这里只做「路径 + 类型」两件事：
 * 页面不该知道接口是 mock 还是真后端。路径与形状对齐契约后，
 * 第二段换 NestJS 时本文件一行不用改（mock 的开关在 src/mock/index.ts，由环境变量控制）。
 *
 * 类型全部从 `@rcp/shared` 派生，不手抄字段：schema 改字段时这里会编译报错，
 * 而不是等到页面渲染出 undefined 才发现。
 */

/** 列表筛选条件：业务筛选参数平铺，不包一层 filter（契约 3.5C） */
export interface ConsultListQuery {
  status?: ConsultStatus
  patientName?: string
  departmentName?: string
  /** yyyy-MM-dd，按 createdAt 的日期部分比较 */
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

/** 页签角标计数：与状态字典一一对应，all 为全量 */
export interface ConsultCounts {
  all: number
  pendingAccept: number
  accepted: number
  scheduled: number
  inProgress: number
  pendingSign: number
  archived: number
  voided: number
}

/** 合规预检单项 */
export interface PrecheckItem {
  key: string
  label: string
  passed: boolean
  detail: string
}

/** 合规预检结果：blocked 为 true 时页面必须禁用「提交」，并展示 blockCode 对应的原因与下一步 */
export interface PrecheckResult {
  items: PrecheckItem[]
  blocked: boolean
  blockCode?: number
}

/**
 * 建单入参。
 * 直接用 shared 的 `createConsultationSchema` 推导结果（CreateConsultationRequest = z.input），
 * 带默认值的字段（createdOnBehalf）在入参侧可省略，与后端接收的 JSON 完全一致。
 */
export type CreateConsultationInput = CreateConsultationRequest

/** 机构字典项 */
export interface DictOrg {
  id: string
  name: string
}

/** 医师字典项（qualificationOk 不下发，属于选择器内部判断） */
export interface DictDoctor {
  id: string
  name: string
  title: string
  orgId: string
}

/** 详情页把 orgId / doctorId 翻译成名称用；实体里只存 id，名称不进单据 */
export interface ConsultDictionaries {
  orgs: DictOrg[]
  doctors: DictDoctor[]
}

/** GET /consultations —— 分页列表，按 createdAt 倒序 */
export function fetchConsultList(query: ConsultListQuery): Promise<PageResult<ConsultOrder>> {
  // 显式列出字段而不用 `...query`：未填的筛选项保持 undefined，axios 会自动剔除，
  // 不会被序列化成字符串 "undefined" 传给后端
  return httpGet<PageResult<ConsultOrder>>('/consultations', {
    status: query.status,
    patientName: query.patientName,
    departmentName: query.departmentName,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    page: query.page,
    pageSize: query.pageSize,
  })
}

/** GET /consultations/counts —— 页签角标，服务端实时统计 */
export function fetchConsultCounts(): Promise<ConsultCounts> {
  return httpGet<ConsultCounts>('/consultations/counts')
}

/** GET /consultations/:id —— 单条详情；不存在抛 ApiError(10004) */
export function fetchConsultDetail(id: string): Promise<ConsultOrder> {
  return httpGet<ConsultOrder>(`/consultations/${encodeURIComponent(id)}`)
}

/** POST /consultations —— 发起会诊；首诊患者抛 ApiError(20003) */
export function createConsultation(input: CreateConsultationInput): Promise<ConsultOrder> {
  return httpPost<ConsultOrder>('/consultations', input)
}

/**
 * POST /consultations/:id/transition —— 状态流转。
 * 非法流转抛 ApiError(20005)，作废未填原因抛 ApiError(10001)。
 * 页面不要自己判断「这个动作能不能点」之外的东西，合法性以接口为准（状态机同源）。
 */
export function transitionConsult(
  id: string,
  action: ConsultAction,
  reason?: string,
): Promise<ConsultOrder> {
  return httpPost<ConsultOrder>(`/consultations/${encodeURIComponent(id)}/transition`, {
    action,
    reason,
  })
}

/** GET /consultations/precheck —— 合规预检，blocked 为 true 时禁止提交 */
export function precheckConsult(patientId: string): Promise<PrecheckResult> {
  return httpGet<PrecheckResult>('/consultations/precheck', { patientId })
}

/**
 * GET /dictionaries —— 机构 / 医师字典。
 * 详情页用 orgId、invitedDoctorIds 查名称：单据只存 id（机构改名不改写历史单据），
 * 名称属于展示层，必须走字典翻译。
 */
export function fetchDictionaries(): Promise<ConsultDictionaries> {
  return httpGet<ConsultDictionaries>('/dictionaries')
}
