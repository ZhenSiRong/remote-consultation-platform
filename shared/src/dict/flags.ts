/**
 * 叠加标记 flag 字典
 * 依据：架构决策.md 3.3C + A-04（7 主态 + 叠加标记，超时/异常/录制中**不进状态机**）
 *
 * 规则：主态只能有一个；flag 可多个叠加。禁止出现"进行中-超时"这类复合枚举。
 */
export const CONSULT_FLAGS = [
  'TIMEOUT',
  'EXCEPTION',
  'PENDING_COSIGN',
  'RECORDING',
  'MASKED',
] as const;

export type ConsultFlag = (typeof CONSULT_FLAGS)[number];

export interface ConsultFlagMeta {
  readonly code: ConsultFlag;
  readonly label: string;
  /** 语义色 CSS 变量名（不含 #hex） */
  readonly token: string;
  /** 图标语义名，由前端 StatusTag / FlagBadge 映射到具体图标组件 */
  readonly icon: 'CLOCK' | 'ALERT' | 'PEN' | 'DOT' | 'LOCK';
  readonly animated: boolean;
}

export const CONSULT_FLAG_META: Readonly<Record<ConsultFlag, ConsultFlagMeta>> = {
  TIMEOUT: {
    code: 'TIMEOUT',
    label: '超时',
    token: '--status-warning',
    icon: 'CLOCK',
    animated: false,
  },
  EXCEPTION: {
    code: 'EXCEPTION',
    label: '异常',
    token: '--status-danger',
    icon: 'ALERT',
    animated: false,
  },
  PENDING_COSIGN: {
    code: 'PENDING_COSIGN',
    label: '待补签',
    token: '--status-pending-sign',
    icon: 'PEN',
    animated: false,
  },
  RECORDING: {
    code: 'RECORDING',
    label: '录制中',
    token: '--status-danger',
    icon: 'DOT',
    animated: true,
  },
  MASKED: {
    code: 'MASKED',
    label: '已脱敏',
    token: '--status-neutral',
    icon: 'LOCK',
    animated: false,
  },
};

export const CONSULT_FLAG_LIST: readonly ConsultFlagMeta[] = CONSULT_FLAGS.map(
  (code) => CONSULT_FLAG_META[code],
);

export function isConsultFlag(value: unknown): value is ConsultFlag {
  return typeof value === 'string' && (CONSULT_FLAGS as readonly string[]).includes(value);
}
