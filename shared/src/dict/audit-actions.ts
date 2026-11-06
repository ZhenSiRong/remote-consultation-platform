/**
 * 留痕动作字典（唯一来源）
 * 依据：架构决策.md 3.7A「必留痕动作清单」、3.8.4A1（`action` 来自 `shared/audit-actions`，与前端枚举同源）
 *
 * 未在本清单声明的动作，**不允许**调用留痕接口（3.1 SOP 第 3 步）。
 * `sensitive = true` 的动作走 `AuditWriter.writeOrThrow()`：留痕失败即拒绝业务（fail-closed，60001）。
 */
export const AUDIT_ACTIONS = [
  'LOGIN',
  'CONSULT_CREATE',
  'INVITE',
  'ROOM_JOIN',
  'ROOM_LEAVE',
  'EMR_READ',
  'EMR_EXPORT',
  'MASK_REVEAL',
  'OPINION_WRITE',
  'SIGN',
  'ARCHIVE',
  'VOID',
  'PERM_CHANGE',
  'RECORDING_START',
  'RECORDING_STOP',
  'RECORDING_VIEW',
  'AUDIT_EXPORT',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditActionMeta {
  readonly code: AuditAction;
  readonly label: string;
  /** 敏感动作：fail-closed（3.8.4A4） */
  readonly sensitive: boolean;
}

export const AUDIT_ACTION_META: Readonly<Record<AuditAction, AuditActionMeta>> = {
  LOGIN: { code: 'LOGIN', label: '登录', sensitive: false },
  CONSULT_CREATE: { code: 'CONSULT_CREATE', label: '创建会诊单', sensitive: false },
  INVITE: { code: 'INVITE', label: '邀约专家', sensitive: false },
  ROOM_JOIN: { code: 'ROOM_JOIN', label: '进入会场', sensitive: false },
  ROOM_LEAVE: { code: 'ROOM_LEAVE', label: '离开会场', sensitive: false },
  EMR_READ: { code: 'EMR_READ', label: '调阅病历', sensitive: true },
  EMR_EXPORT: { code: 'EMR_EXPORT', label: '导出病历', sensitive: true },
  MASK_REVEAL: { code: 'MASK_REVEAL', label: '展开明文', sensitive: true },
  OPINION_WRITE: { code: 'OPINION_WRITE', label: '填写会诊意见', sensitive: false },
  SIGN: { code: 'SIGN', label: '电子签名', sensitive: true },
  ARCHIVE: { code: 'ARCHIVE', label: '归档', sensitive: true },
  VOID: { code: 'VOID', label: '作废', sensitive: false },
  PERM_CHANGE: { code: 'PERM_CHANGE', label: '权限变更', sensitive: true },
  RECORDING_START: { code: 'RECORDING_START', label: '开始录制', sensitive: false },
  RECORDING_STOP: { code: 'RECORDING_STOP', label: '停止录制', sensitive: false },
  RECORDING_VIEW: { code: 'RECORDING_VIEW', label: '调阅录制', sensitive: false },
  AUDIT_EXPORT: { code: 'AUDIT_EXPORT', label: '导出审计日志', sensitive: true },
};

export const AUDIT_ACTION_LIST: readonly AuditActionMeta[] = AUDIT_ACTIONS.map(
  (code) => AUDIT_ACTION_META[code],
);

/** 3.8.4A4 敏感动作集合：必须 writeOrThrow，写失败 → 60001 且业务回滚 */
export const SENSITIVE_AUDIT_ACTIONS: readonly AuditAction[] = AUDIT_ACTIONS.filter(
  (code) => AUDIT_ACTION_META[code].sensitive,
);

export function isSensitiveAuditAction(action: AuditAction): boolean {
  return AUDIT_ACTION_META[action].sensitive;
}

/** 3.8.4A1 `result` 取值 */
export const AUDIT_RESULTS = ['SUCCESS', 'DENIED', 'ERROR'] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];

export interface AuditResultMeta {
  readonly code: AuditResult;
  readonly label: string;
  readonly token: string;
}

export const AUDIT_RESULT_META: Readonly<Record<AuditResult, AuditResultMeta>> = {
  SUCCESS: { code: 'SUCCESS', label: '成功', token: '--status-success' },
  DENIED: { code: 'DENIED', label: '拒绝', token: '--status-warning' },
  ERROR: { code: 'ERROR', label: '异常', token: '--status-danger' },
};
