import {
  consultOrderSchema,
  type ConsultFlag,
  type ConsultOrder,
  type ConsultStatus,
  type PatientBrief,
} from '@rcp/shared'

/**
 * 会诊工单种子数据（A1）。
 *
 * 为什么每条都过 `consultOrderSchema.parse()`：
 * 这是「两段式」的契约测试。mock 吐出的形状只要和契约差一个字段，
 * 第二段换 NestJS 真后端时页面就会突然崩，而那时排查成本远高于现在。
 * 让它在模块加载时当场炸，问题暴露在写 mock 的这一秒。
 *
 * 数据是给验收脚本和演示用的，所以分布是刻意设计的：
 * 4 待受理 / 2 已受理 / 2 已排期 / 2 进行中 / 1 待签署 / 1 已归档 / 0 已作废。
 * 作废态故意不给种子——它只能由用户点「作废」产生，演示时才能看出内存是真的在变。
 */

/** 本院机构 id：申请方与数据归属方 */
export const SELF_ORG_ID = 'org-1001'

export interface PatientOption {
  id: string
  name: string
  gender: PatientBrief['gender']
  age: number
  inpatientNo: string
  hasPriorVisit: boolean
}

export interface OrgOption {
  id: string
  name: string
}

export interface DoctorOption {
  id: string
  name: string
  title: string
  orgId: string
  qualificationOk: boolean
}

/** 受邀机构候选 */
export const ORG_OPTIONS: ReadonlyArray<OrgOption> = [
  { id: 'org-2001', name: '省人民医院' },
  { id: 'org-2002', name: '市中心医院' },
  { id: 'org-2003', name: '医科大学附属医院' },
  { id: 'org-2004', name: '市肿瘤医院' },
]

/** 受邀医生候选：资质全部有效，页面可直接按 qualificationOk 置灰不可选 */
export const DOCTOR_OPTIONS: ReadonlyArray<DoctorOption> = [
  { id: 'doc-3001', name: '陈立群', title: '主任医师', orgId: 'org-2001', qualificationOk: true },
  { id: 'doc-3002', name: '赵敏', title: '副主任医师', orgId: 'org-2001', qualificationOk: true },
  { id: 'doc-3003', name: '孙建平', title: '主任医师', orgId: 'org-2002', qualificationOk: true },
  { id: 'doc-3004', name: '周文静', title: '副主任医师', orgId: 'org-2003', qualificationOk: true },
  { id: 'doc-3005', name: '吴国栋', title: '主任医师', orgId: 'org-2004', qualificationOk: true },
]

/**
 * 全院患者名录（种子工单会用到全部 10 人）。
 * 为什么名录比候选多：工单是历史数据，患者不一定还出现在「新建会诊」候选里；
 * 但姓名模糊搜索要能命中明文名，所以名录必须覆盖所有种子患者。
 */
const PATIENTS: ReadonlyArray<PatientOption> = [
  { id: 'pat-1001', name: '李建国', gender: 'MALE', age: 68, inpatientNo: 'ZY2026001234', hasPriorVisit: true },
  { id: 'pat-1002', name: '李秀兰', gender: 'FEMALE', age: 57, inpatientNo: 'ZY2026002145', hasPriorVisit: true },
  { id: 'pat-1003', name: '李明', gender: 'MALE', age: 34, inpatientNo: 'ZY2026003087', hasPriorVisit: true },
  { id: 'pat-1004', name: '张伟', gender: 'MALE', age: 45, inpatientNo: 'ZY2026004112', hasPriorVisit: true },
  { id: 'pat-1005', name: '周晓梅', gender: 'FEMALE', age: 29, inpatientNo: 'ZY2026005966', hasPriorVisit: false },
  { id: 'pat-1006', name: '王芳', gender: 'FEMALE', age: 52, inpatientNo: 'ZY2026005633', hasPriorVisit: true },
  { id: 'pat-1007', name: '陈志强', gender: 'MALE', age: 61, inpatientNo: 'ZY2026006841', hasPriorVisit: true },
  { id: 'pat-1008', name: '刘桂英', gender: 'FEMALE', age: 73, inpatientNo: 'ZY2026007720', hasPriorVisit: true },
  { id: 'pat-1009', name: '赵国庆', gender: 'MALE', age: 49, inpatientNo: 'ZY2026008355', hasPriorVisit: true },
  { id: 'pat-1010', name: '孙丽', gender: 'FEMALE', age: 38, inpatientNo: 'ZY2026009188', hasPriorVisit: true },
]

/**
 * 新建会诊可选患者（5 人）。
 * `周晓梅` 是首诊（hasPriorVisit: false），且不出现在任何种子工单里——
 * 专供演示 R3 拦截：选她发起会诊必然命中 20003，其它患者都能正常建单。
 */
export const PATIENT_OPTIONS: ReadonlyArray<PatientOption> = [
  PATIENTS[0],
  PATIENTS[1],
  PATIENTS[2],
  PATIENTS[3],
  PATIENTS[4],
]

/** 科室 → 申请医师（发起人） */
const APPLICANT_DOCTOR_BY_DEPARTMENT: Readonly<Record<string, string>> = {
  心内科: 'doc-1001',
  神经内科: 'doc-1002',
  呼吸内科: 'doc-1003',
  影像科: 'doc-1004',
  肿瘤科: 'doc-1005',
}

/** 脱敏规则：保留姓氏，其余打码（后端已脱敏，前端只展示不还原，A-06） */
function maskName(name: string): string {
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(name.length - 1, 1))}`
}

/** 住院号保留前 4 位与后 4 位 */
function maskInpatientNo(inpatientNo: string): string {
  return inpatientNo.length <= 8
    ? `${inpatientNo.slice(0, 2)}****`
    : `${inpatientNo.slice(0, 4)}****${inpatientNo.slice(-4)}`
}

/** 按 id 找患者；找不到返回 undefined，由调用方决定报什么错 */
export function findPatient(patientId: string): PatientOption | undefined {
  return PATIENTS.find((item) => item.id === patientId)
}

/** 明文姓名：仅供 mock 内部做模糊搜索，实体里永远只放 nameMasked */
export function getPatientName(patientId: string): string | undefined {
  return findPatient(patientId)?.name
}

/** 患者候选 → 实体里的脱敏视图；patientId 不存在时抛错（属于 mock 自身 bug，由 adapter 兜成 90001） */
export function toPatientBrief(
  patientId: string,
  departmentName: string | null = null,
): PatientBrief {
  const patient = findPatient(patientId)
  if (!patient) {
    throw new Error(`[mock] 未登记的患者：${patientId}`)
  }

  return {
    patientId: patient.id,
    nameMasked: maskName(patient.name),
    gender: patient.gender,
    age: patient.age,
    idCardMasked: '310101********1234',
    phoneMasked: '138****5678',
    inpatientNoMasked: maskInpatientNo(patient.inpatientNo),
    orgId: SELF_ORG_ID,
    departmentName,
  }
}

/** 种子行的紧凑结构：只写「有差异」的字段，其余由 buildOrder 补齐，避免 12 条数据里大量重复 */
interface SeedRow {
  seq: number
  patientId: string
  departmentName: string
  status: ConsultStatus
  createdAt: string
  scheduledAt?: string
  startedAt?: string
  endedAt?: string
  invitedOrgId: string
  invitedDoctorIds: string[]
  consultPurpose: string
  chiefComplaint: string
  diagnosisSummary: string
  flags?: ConsultFlag[]
  createdOnBehalf?: boolean
}

const SEED_ROWS: ReadonlyArray<SeedRow> = [
  {
    seq: 1,
    patientId: 'pat-1001',
    departmentName: '心内科',
    status: 'PENDING_ACCEPT',
    createdAt: '2026-11-06T09:30:00+08:00',
    invitedOrgId: 'org-2001',
    invitedDoctorIds: ['doc-3001'],
    consultPurpose: '冠心病介入术后随访方案远程确认',
    chiefComplaint: '反复胸闷 3 年，加重 1 周',
    diagnosisSummary: '冠状动脉粥样硬化性心脏病，PCI 术后 6 个月',
  },
  {
    seq: 2,
    patientId: 'pat-1004',
    departmentName: '神经内科',
    status: 'PENDING_ACCEPT',
    createdAt: '2026-11-05T15:10:00+08:00',
    invitedOrgId: 'org-2002',
    invitedDoctorIds: ['doc-3003'],
    consultPurpose: '急性脑梗死静脉溶栓适应证远程评估',
    chiefComplaint: '突发右侧肢体无力 4 小时',
    diagnosisSummary: '急性缺血性脑卒中（左侧基底节区）',
  },
  {
    seq: 3,
    patientId: 'pat-1002',
    departmentName: '呼吸内科',
    status: 'PENDING_ACCEPT',
    createdAt: '2026-11-04T10:05:00+08:00',
    invitedOrgId: 'org-2003',
    invitedDoctorIds: ['doc-3004'],
    consultPurpose: '间质性肺病激素方案调整会诊',
    chiefComplaint: '干咳伴活动后气促 8 个月',
    diagnosisSummary: '特发性肺纤维化，长期口服糖皮质激素',
  },
  {
    seq: 4,
    patientId: 'pat-1007',
    departmentName: '影像科',
    status: 'PENDING_ACCEPT',
    createdAt: '2026-11-03T08:40:00+08:00',
    invitedOrgId: 'org-2001',
    invitedDoctorIds: ['doc-3001', 'doc-3002'],
    consultPurpose: '肺部结节薄层 CT 影像判读',
    chiefComplaint: '体检发现右肺上叶结节 1 个月',
    diagnosisSummary: '右肺上叶磨玻璃结节（8mm），待鉴别性质',
    createdOnBehalf: true,
  },
  {
    seq: 5,
    patientId: 'pat-1006',
    departmentName: '肿瘤科',
    status: 'ACCEPTED',
    createdAt: '2026-11-02T14:20:00+08:00',
    invitedOrgId: 'org-2004',
    invitedDoctorIds: ['doc-3005'],
    consultPurpose: '乳腺癌新辅助化疗方案远程讨论',
    chiefComplaint: '左乳无痛性肿块 2 个月',
    diagnosisSummary: '左乳浸润性导管癌 cT2N1M0',
  },
  {
    seq: 6,
    patientId: 'pat-1008',
    departmentName: '心内科',
    status: 'ACCEPTED',
    createdAt: '2026-10-31T11:00:00+08:00',
    invitedOrgId: 'org-2002',
    invitedDoctorIds: ['doc-3003'],
    consultPurpose: '难治性高血压用药方案远程指导',
    chiefComplaint: '血压控制不佳 2 年，头晕伴乏力',
    diagnosisSummary: '原发性高血压 3 级（很高危），联合用药血压仍未达标',
  },
  {
    seq: 7,
    patientId: 'pat-1003',
    departmentName: '神经内科',
    status: 'SCHEDULED',
    createdAt: '2026-10-30T09:15:00+08:00',
    scheduledAt: '2026-11-08T14:00:00+08:00',
    invitedOrgId: 'org-2001',
    invitedDoctorIds: ['doc-3001'],
    consultPurpose: '癫痫药物血药浓度异常远程会诊',
    chiefComplaint: '发作性意识丧失 5 年，近 1 月发作频次增加',
    diagnosisSummary: '局灶性癫痫，丙戊酸钠血药浓度偏低',
  },
  {
    seq: 8,
    patientId: 'pat-1009',
    departmentName: '呼吸内科',
    status: 'SCHEDULED',
    createdAt: '2026-10-28T16:45:00+08:00',
    scheduledAt: '2026-11-09T09:30:00+08:00',
    invitedOrgId: 'org-2003',
    invitedDoctorIds: ['doc-3004'],
    consultPurpose: '慢阻肺急性加重期无创通气参数远程调整',
    chiefComplaint: '咳嗽咳痰 10 年，气促加重 3 天',
    diagnosisSummary: '慢性阻塞性肺疾病急性加重（GOLD 3 级）',
  },
  {
    seq: 9,
    patientId: 'pat-1004',
    departmentName: '影像科',
    status: 'IN_PROGRESS',
    createdAt: '2026-10-26T13:30:00+08:00',
    scheduledAt: '2026-11-06T10:00:00+08:00',
    startedAt: '2026-11-06T10:05:00+08:00',
    invitedOrgId: 'org-2001',
    invitedDoctorIds: ['doc-3002'],
    consultPurpose: '颅脑 MRI 增强影像远程判读',
    chiefComplaint: '头痛伴视物模糊 2 周',
    diagnosisSummary: '颅内占位性病变待定，需影像专家判读',
    flags: ['RECORDING'],
  },
  {
    seq: 10,
    patientId: 'pat-1010',
    departmentName: '肿瘤科',
    status: 'IN_PROGRESS',
    createdAt: '2026-10-24T10:50:00+08:00',
    scheduledAt: '2026-11-06T08:20:00+08:00',
    startedAt: '2026-11-06T08:30:00+08:00',
    invitedOrgId: 'org-2004',
    invitedDoctorIds: ['doc-3005'],
    consultPurpose: '晚期胃癌免疫治疗不良反应远程评估',
    chiefComplaint: '上腹隐痛 4 个月，进食后加重',
    diagnosisSummary: '胃腺癌 IV 期，免疫治疗后出现皮疹与乏力',
  },
  {
    seq: 11,
    patientId: 'pat-1007',
    departmentName: '心内科',
    status: 'PENDING_SIGN',
    createdAt: '2026-10-22T09:00:00+08:00',
    scheduledAt: '2026-10-22T10:00:00+08:00',
    startedAt: '2026-10-22T10:05:00+08:00',
    endedAt: '2026-10-22T10:50:00+08:00',
    invitedOrgId: 'org-2002',
    invitedDoctorIds: ['doc-3003'],
    consultPurpose: '心房颤动抗凝方案远程会诊',
    chiefComplaint: '阵发性心悸 1 年，伴活动耐量下降',
    diagnosisSummary: '非瓣膜性心房颤动，CHA2DS2-VASc 评分 4 分',
    flags: ['PENDING_COSIGN'],
  },
  {
    seq: 12,
    patientId: 'pat-1006',
    departmentName: '肿瘤科',
    status: 'ARCHIVED',
    createdAt: '2026-10-20T08:20:00+08:00',
    scheduledAt: '2026-10-20T09:00:00+08:00',
    startedAt: '2026-10-20T09:05:00+08:00',
    endedAt: '2026-10-20T09:55:00+08:00',
    invitedOrgId: 'org-2003',
    invitedDoctorIds: ['doc-3004'],
    consultPurpose: '肺癌靶向治疗耐药后方案远程讨论',
    chiefComplaint: '确诊肺腺癌 2 年，近期复查病灶增大',
    diagnosisSummary: '右肺腺癌 EGFR 突变，一代 TKI 耐药',
  },
]

function padSeq(seq: number): string {
  return String(seq).padStart(4, '0')
}

function buildOrder(row: SeedRow): ConsultOrder {
  // 最后动作时间即更新时间：种子没有单独维护 updatedAt，避免两处时间互相矛盾
  const updatedAt = row.endedAt ?? row.startedAt ?? row.scheduledAt ?? row.createdAt

  return {
    id: `ord-${padSeq(row.seq)}`,
    orderNo: `HZ2026${padSeq(row.seq)}`,
    orgId: SELF_ORG_ID,
    applicantOrgId: SELF_ORG_ID,
    invitedOrgId: row.invitedOrgId,
    patient: toPatientBrief(row.patientId, row.departmentName),
    departmentName: row.departmentName,
    consultPurpose: row.consultPurpose,
    chiefComplaint: row.chiefComplaint,
    diagnosisSummary: row.diagnosisSummary,
    status: row.status,
    flags: row.flags ?? [],
    scheduledAt: row.scheduledAt ?? null,
    startedAt: row.startedAt ?? null,
    endedAt: row.endedAt ?? null,
    applicantDoctorId: APPLICANT_DOCTOR_BY_DEPARTMENT[row.departmentName],
    invitedDoctorIds: row.invitedDoctorIds,
    createdBy: 'usr-4001',
    createdOnBehalf: row.createdOnBehalf ?? false,
    createdAt: row.createdAt,
    updatedAt,
  }
}

/**
 * 种子工单（12 条）。
 * parse 不放进 map 链里而单独一行，是为了让「哪条数据不合契约」在报错栈里一眼可见。
 */
export const SEED_ORDERS: ReadonlyArray<ConsultOrder> = SEED_ROWS.map((row) => {
  const order = buildOrder(row)
  return consultOrderSchema.parse(order)
})
