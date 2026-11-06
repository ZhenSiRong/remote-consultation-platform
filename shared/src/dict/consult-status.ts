/**
 * 会诊工单主态字典（7 态）
 * 依据：架构决策.md 3.3A（主态表）、3.5F（UPPER_SNAKE 编码）、A-04（7 主态 + 叠加 flag）
 *
 * 铁律：全站状态色只有这一张表，页面里**禁止出现十六进制色值**，只能引用 token。
 */
export const CONSULT_STATUS = [
  'PENDING_ACCEPT',
  'ACCEPTED',
  'SCHEDULED',
  'IN_PROGRESS',
  'PENDING_SIGN',
  'ARCHIVED',
  'VOIDED',
] as const;

export type ConsultStatus = (typeof CONSULT_STATUS)[number];

/**
 * 3.3B 区分度补丁：`进行中` 与 `已归档` 同色，**不新增颜色**，用形状与字重区分。
 * - BREATHING_DOT：实心色点 + 呼吸动画（进行中）
 * - CHECK_DIM：对勾图标 + 文字降低一档不透明度 0.75（已归档）
 */
export type ConsultStatusDecoration = 'SOLID_DOT' | 'BREATHING_DOT' | 'CHECK_DIM';

export interface ConsultStatusMeta {
  readonly code: ConsultStatus;
  readonly label: string;
  /** 语义色 CSS 变量名（不含 #hex） */
  readonly token: string;
  readonly decoration: ConsultStatusDecoration;
  readonly description: string;
  /** 终态：不允许再流转 */
  readonly terminal: boolean;
}

export const CONSULT_STATUS_META: Readonly<Record<ConsultStatus, ConsultStatusMeta>> = {
  PENDING_ACCEPT: {
    code: 'PENDING_ACCEPT',
    label: '待受理',
    token: '--status-neutral',
    decoration: 'SOLID_DOT',
    description: '已提交、尚未被受理（= 待会诊）',
    terminal: false,
  },
  ACCEPTED: {
    code: 'ACCEPTED',
    label: '已受理',
    token: '--status-info',
    decoration: 'SOLID_DOT',
    description: '受邀方已受理，待排期',
    terminal: false,
  },
  SCHEDULED: {
    code: 'SCHEDULED',
    label: '排期/待开始',
    token: '--status-warning',
    decoration: 'SOLID_DOT',
    description: '已排期，会诊尚未开始',
    terminal: false,
  },
  IN_PROGRESS: {
    code: 'IN_PROGRESS',
    label: '进行中',
    token: '--status-active',
    decoration: 'BREATHING_DOT',
    description: '会诊进行中',
    terminal: false,
  },
  PENDING_SIGN: {
    code: 'PENDING_SIGN',
    label: '待签署',
    token: '--status-pending-sign',
    decoration: 'SOLID_DOT',
    description: '记录已生成，等待各方电子签名',
    terminal: false,
  },
  ARCHIVED: {
    code: 'ARCHIVED',
    label: '已归档',
    token: '--status-success',
    decoration: 'CHECK_DIM',
    description: '各方签署齐全并已归档',
    terminal: true,
  },
  VOIDED: {
    code: 'VOIDED',
    label: '已作废',
    token: '--status-danger',
    decoration: 'SOLID_DOT',
    description: '异常终止（主动撤销与异常终止当前按同一状态处理，见 3.3 待确认项）',
    terminal: true,
  },
};

/** 按业务顺序排列的元数据列表，供下拉、图例、筛选器直接消费 */
export const CONSULT_STATUS_LIST: readonly ConsultStatusMeta[] = CONSULT_STATUS.map(
  (code) => CONSULT_STATUS_META[code],
);

export function isConsultStatus(value: unknown): value is ConsultStatus {
  return typeof value === 'string' && (CONSULT_STATUS as readonly string[]).includes(value);
}

export function getConsultStatusMeta(code: ConsultStatus): ConsultStatusMeta {
  return CONSULT_STATUS_META[code];
}

/** 渲染用：`var(--status-neutral)`。页面只允许经由该函数或 StatusTag 取色 */
export function consultStatusColorVar(code: ConsultStatus): string {
  return `var(${CONSULT_STATUS_META[code].token})`;
}
