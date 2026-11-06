/**
 * 权限点常量与角色矩阵 —— 唯一来源
 * 依据：架构决策.md 3.6（A 角色 / B 权限矩阵 / D 命名与同步）
 *
 * 命名：`域:资源:动作`，全小写。
 *   - 资源固定 8 个：consultation / room / patient_record / record / signature /
 *     consent / audit_log / org_protocol
 *   - 域取该资源所属模块：consult / av / emr / rec / audit / org
 *
 * **逐格一致**：PERMISSION_MATRIX 的 11 行 × 6 角色 = 66 格，与 3.6B 矩阵一一对应。
 * 3.6B 用 ✅ / 👁 / — 三态表达，此处落为 'FULL' / 'READ_ONLY' / 'NONE'：
 *   ✅ → FULL，👁（只读/监控/复核）→ READ_ONLY，— → NONE。
 * 矩阵未列出的操作**不得**新增权限点；新增必须前后端同时提交（3.6D），否则视为未完成。
 */

export const ROLES = ['DO', 'EXP', 'PAT', 'COORD', 'IT', 'MQ'] as const;
export type Role = (typeof ROLES)[number];

export interface RoleMeta {
  readonly code: Role;
  readonly label: string;
}

/** 3.6A 六类角色（【实证】用户故事集干系人表） */
export const ROLE_META: Readonly<Record<Role, RoleMeta>> = {
  DO: { code: 'DO', label: '发起方医生' },
  EXP: { code: 'EXP', label: '受邀专家' },
  PAT: { code: 'PAT', label: '患者（或其授权代理人）' },
  COORD: { code: 'COORD', label: '会诊协调员/护士' },
  IT: { code: 'IT', label: '信息科管理员' },
  MQ: { code: 'MQ', label: '医务科/质控' },
};

/** 3.6B 资源（8 个，不得增删） */
export const PERMISSION_RESOURCES = [
  'consultation',
  'room',
  'patient_record',
  'record',
  'signature',
  'consent',
  'audit_log',
  'org_protocol',
] as const;
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export type AccessLevel = 'NONE' | 'READ_ONLY' | 'FULL';

export const PERMISSIONS = {
  CONSULTATION_CREATE: 'consult:consultation:create',
  CONSULTATION_INVITE: 'consult:consultation:invite',
  ROOM_ENTER: 'av:room:enter',
  ROOM_CONTROL: 'av:room:control',
  PATIENT_RECORD_READ: 'emr:patient_record:read',
  RECORD_WRITE_OPINION: 'rec:record:write_opinion',
  RECORD_ARCHIVE: 'rec:record:archive',
  SIGNATURE_SIGN: 'rec:signature:sign',
  CONSENT_SIGN: 'emr:consent:sign',
  AUDIT_LOG_EXPORT: 'audit:audit_log:export',
  ORG_PROTOCOL_MANAGE: 'org:org_protocol:manage',
} as const;

export type PermissionPoint = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly PermissionPoint[] = Object.values(PERMISSIONS);

export interface PermissionDefinition {
  readonly point: PermissionPoint;
  readonly domain: string;
  readonly resource: PermissionResource;
  readonly action: string;
  /** 对应 3.6B 矩阵的「操作」行名 */
  readonly row: string;
  /** 矩阵里的限定语（授权范围内 / 代发起 / 系统校验签名后 …） */
  readonly note: string;
}

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  {
    point: PERMISSIONS.CONSULTATION_CREATE,
    domain: 'consult',
    resource: 'consultation',
    action: 'create',
    row: '发起会诊',
    note: 'COORD 为「代发起」，需在工单上记录 createdOnBehalf=true',
  },
  {
    point: PERMISSIONS.CONSULTATION_INVITE,
    domain: 'consult',
    resource: 'consultation',
    action: 'invite',
    row: '邀约专家',
    note: '邀约前须通过 R2 资质与 R4 知情同意校验',
  },
  {
    point: PERMISSIONS.ROOM_ENTER,
    domain: 'av',
    resource: 'room',
    action: 'enter',
    row: '进入会场',
    note: 'PAT 只读、MQ 监控（均为 READ_ONLY）',
  },
  {
    point: PERMISSIONS.ROOM_CONTROL,
    domain: 'av',
    resource: 'room',
    action: 'control',
    row: '会场权限控制（静音/移出）',
    note: '仅 COORD；变更实时生效并留痕 PERM_CHANGE',
  },
  {
    point: PERMISSIONS.PATIENT_RECORD_READ,
    domain: 'emr',
    resource: 'patient_record',
    action: 'read',
    row: '调阅病历',
    note: 'DO/EXP 限授权范围内；PAT 仅本人摘要；MQ 为质控视角（后两者 READ_ONLY）',
  },
  {
    point: PERMISSIONS.RECORD_WRITE_OPINION,
    domain: 'rec',
    resource: 'record',
    action: 'write_opinion',
    row: '填写本人意见',
    note: '只能写本人分区，他人意见不可单方面修改（US-REC-02）',
  },
  {
    point: PERMISSIONS.RECORD_ARCHIVE,
    domain: 'rec',
    resource: 'record',
    action: 'archive',
    row: '归档',
    note: 'DO 需系统校验签名齐全后放行；MQ 为只读复核（READ_ONLY）',
  },
  {
    point: PERMISSIONS.SIGNATURE_SIGN,
    domain: 'rec',
    resource: 'signature',
    action: 'sign',
    row: '电子签名',
    note: '服务端签署（A-12），签名与内容哈希绑定',
  },
  {
    point: PERMISSIONS.CONSENT_SIGN,
    domain: 'emr',
    resource: 'consent',
    action: 'sign',
    row: '知情同意签署',
    note: '仅 PAT；本期由机构端代录（P-05 / E-08），可撤回',
  },
  {
    point: PERMISSIONS.AUDIT_LOG_EXPORT,
    domain: 'audit',
    resource: 'audit_log',
    action: 'export',
    row: '导出审计日志',
    note: 'IT / MQ；导出动作本身留痕 AUDIT_EXPORT',
  },
  {
    point: PERMISSIONS.ORG_PROTOCOL_MANAGE,
    domain: 'org',
    resource: 'org_protocol',
    action: 'manage',
    row: '配置机构协议',
    note: '仅 IT；对应 R1 / R12 机构对机构合规',
  },
];

/**
 * 角色 × 权限点矩阵（11 行 × 6 列 = 66 格，与 3.6B 逐格一致）
 */
export const PERMISSION_MATRIX: Readonly<
  Record<PermissionPoint, Readonly<Record<Role, AccessLevel>>>
> = {
  'consult:consultation:create': {
    DO: 'FULL',
    EXP: 'NONE',
    PAT: 'NONE',
    COORD: 'FULL',
    IT: 'NONE',
    MQ: 'NONE',
  },
  'consult:consultation:invite': {
    DO: 'FULL',
    EXP: 'NONE',
    PAT: 'NONE',
    COORD: 'FULL',
    IT: 'NONE',
    MQ: 'NONE',
  },
  'av:room:enter': {
    DO: 'FULL',
    EXP: 'FULL',
    PAT: 'READ_ONLY',
    COORD: 'FULL',
    IT: 'NONE',
    MQ: 'READ_ONLY',
  },
  'av:room:control': {
    DO: 'NONE',
    EXP: 'NONE',
    PAT: 'NONE',
    COORD: 'FULL',
    IT: 'NONE',
    MQ: 'NONE',
  },
  'emr:patient_record:read': {
    DO: 'FULL',
    EXP: 'FULL',
    PAT: 'READ_ONLY',
    COORD: 'FULL',
    IT: 'NONE',
    MQ: 'READ_ONLY',
  },
  'rec:record:write_opinion': {
    DO: 'FULL',
    EXP: 'FULL',
    PAT: 'NONE',
    COORD: 'NONE',
    IT: 'NONE',
    MQ: 'NONE',
  },
  'rec:record:archive': {
    DO: 'FULL',
    EXP: 'NONE',
    PAT: 'NONE',
    COORD: 'NONE',
    IT: 'NONE',
    MQ: 'READ_ONLY',
  },
  'rec:signature:sign': {
    DO: 'FULL',
    EXP: 'FULL',
    PAT: 'NONE',
    COORD: 'NONE',
    IT: 'NONE',
    MQ: 'NONE',
  },
  'emr:consent:sign': {
    DO: 'NONE',
    EXP: 'NONE',
    PAT: 'FULL',
    COORD: 'NONE',
    IT: 'NONE',
    MQ: 'NONE',
  },
  'audit:audit_log:export': {
    DO: 'NONE',
    EXP: 'NONE',
    PAT: 'NONE',
    COORD: 'NONE',
    IT: 'FULL',
    MQ: 'FULL',
  },
  'org:org_protocol:manage': {
    DO: 'NONE',
    EXP: 'NONE',
    PAT: 'NONE',
    COORD: 'NONE',
    IT: 'FULL',
    MQ: 'NONE',
  },
};

const ACCESS_RANK: Readonly<Record<AccessLevel, number>> = {
  NONE: 0,
  READ_ONLY: 1,
  FULL: 2,
};

/** 判定：角色对权限点的访问级别是否达到 `required`（默认 FULL） */
export function hasPermission(
  role: Role,
  point: PermissionPoint,
  required: AccessLevel = 'FULL',
): boolean {
  return ACCESS_RANK[PERMISSION_MATRIX[point][role]] >= ACCESS_RANK[required];
}

export function accessLevelOf(role: Role, point: PermissionPoint): AccessLevel {
  return PERMISSION_MATRIX[point][role];
}

/** 可读即可（READ_ONLY 及以上）：用于路由级准入与只读展示 */
export function canRead(role: Role, point: PermissionPoint): boolean {
  return hasPermission(role, point, 'READ_ONLY');
}

/** 可写：必须 FULL */
export function canWrite(role: Role, point: PermissionPoint): boolean {
  return hasPermission(role, point, 'FULL');
}

function buildRolePermissions(): Record<Role, PermissionPoint[]> {
  const map = {} as Record<Role, PermissionPoint[]>;
  for (const role of ROLES) {
    map[role] = [];
  }
  for (const point of ALL_PERMISSIONS) {
    for (const role of ROLES) {
      if (PERMISSION_MATRIX[point][role] !== 'NONE') {
        map[role].push(point);
      }
    }
  }
  return map;
}

/** 角色 → 可见权限点集合（路由守卫 / 菜单生成直接消费，不手写死菜单） */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly PermissionPoint[]>> =
  buildRolePermissions();

export function isPermissionPoint(value: unknown): value is PermissionPoint {
  return typeof value === 'string' && (ALL_PERMISSIONS as readonly string[]).includes(value);
}

/** 解析 `域:资源:动作`；不合法返回 null */
export function parsePermissionPoint(
  point: string,
): { domain: string; resource: string; action: string } | null {
  const parts = point.split(':');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return null;
  }
  const [domain, resource, action] = parts as [string, string, string];
  return { domain, resource, action };
}
