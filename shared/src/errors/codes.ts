/**
 * 分段错误码 —— 架构决策.md 3.5D（A-07）
 *
 * | 段      | 域        | 前端行为                                              |
 * |---------|-----------|-------------------------------------------------------|
 * | 0       | 成功      | 正常渲染                                              |
 * | 1xxxx   | 通用/会话 | 统一提示；10002 跳登录；10003 显示无权限页            |
 * | 2xxxx   | 会诊工单  | 拦截类必须给出「原因 + 下一步」                        |
 * | 3xxxx   | 病历/授权 | 30002 触发重新申请授权；30003 告警并留痕              |
 * | 4xxxx   | 记录/签署 | 40002 高亮未签方                                       |
 * | 5xxxx   | 音视频/协同 | 降级提示 + 重试入口                                  |
 * | 6xxxx   | 合规/审计 | 60001 fail-closed：阻断当前操作                        |
 * | 9xxxx   | 系统      | 通用错误页 + 展示 traceId 供报障                       |
 *
 * HTTP 语义（3.5B）：业务规则失败统一 **422**；401 / 403 / 429 / 500 只表传输与会话层。
 */

export const ERROR_CODES = {
  SUCCESS: 0,

  // 1xxxx 通用/会话
  PARAM_INVALID: 10001,
  UNAUTHENTICATED: 10002,
  FORBIDDEN: 10003,
  RESOURCE_NOT_FOUND: 10004,
  IDEMPOTENCY_CONFLICT: 10005,
  RATE_LIMITED: 10006,

  // 2xxxx 会诊工单
  ORG_PROTOCOL_UNSIGNED: 20001,
  QUALIFICATION_INVALID: 20002,
  FIRST_VISIT_BLOCKED: 20003,
  OUT_OF_PRACTICE_SCOPE: 20004,
  ILLEGAL_STATE_TRANSITION: 20005,

  // 3xxxx 病历/授权
  EMR_UNAUTHORIZED: 30001,
  AUTHZ_TICKET_EXPIRED: 30002,
  CROSS_BOUNDARY_READ: 30003,

  // 4xxxx 记录/签署
  REQUIRED_FIELD_MISSING: 40001,
  UNSIGNED_ARCHIVE_FORBIDDEN: 40002,
  SIGNATURE_VERIFY_FAILED: 40003,

  // 5xxxx 音视频/协同
  ROOM_CREATE_FAILED: 50001,
  PARTICIPANT_LIMIT_EXCEEDED: 50002,
  RECORDING_START_FAILED: 50003,

  // 6xxxx 合规/审计
  AUDIT_WRITE_FAILED: 60001,

  // 9xxxx 系统
  INTERNAL_ERROR: 90001,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_SEGMENTS = {
  SUCCESS: '0',
  COMMON: '1xxxx',
  CONSULT: '2xxxx',
  EMR: '3xxxx',
  RECORD: '4xxxx',
  AV: '5xxxx',
  AUDIT: '6xxxx',
  SYSTEM: '9xxxx',
} as const;

export type ErrorSegment = keyof typeof ERROR_SEGMENTS | 'UNKNOWN';

export interface ErrorCodeMeta {
  readonly code: ErrorCode;
  readonly segment: ErrorSegment;
  /** 面向用户的默认提示语（拦截类必须补「下一步」，见 frontendHint） */
  readonly message: string;
  /** 该错误码应使用的 HTTP 状态码 */
  readonly httpStatus: 422 | 401 | 403 | 429 | 500;
  /** 前端拦截器分流动作（3.5D「前端行为」列） */
  readonly frontendHint: string;
  /** 敏感动作 fail-closed：前端须阻断当前 UI 操作 */
  readonly failClosed: boolean;
}

export const ERROR_CODE_META: Readonly<Record<ErrorCode, ErrorCodeMeta>> = {
  0: {
    code: 0,
    segment: 'SUCCESS',
    message: 'ok',
    httpStatus: 422,
    frontendHint: '正常渲染',
    failClosed: false,
  },

  10001: {
    code: 10001,
    segment: 'COMMON',
    message: '参数校验失败',
    httpStatus: 422,
    frontendHint: '定位到首个非法字段并提示',
    failClosed: false,
  },
  10002: {
    code: 10002,
    segment: 'COMMON',
    message: '未登录或会话已过期',
    httpStatus: 401,
    frontendHint: '清除内存态 token，跳登录页并带回跳地址',
    failClosed: false,
  },
  10003: {
    code: 10003,
    segment: 'COMMON',
    message: '无权限执行该操作',
    httpStatus: 403,
    frontendHint: '显示无权限页（与「无数据」严格区分）',
    failClosed: false,
  },
  10004: {
    code: 10004,
    segment: 'COMMON',
    message: '资源不存在',
    httpStatus: 422,
    frontendHint: '显示空态并提供返回列表入口',
    failClosed: false,
  },
  10005: {
    code: 10005,
    segment: 'COMMON',
    message: '重复提交（幂等键冲突）',
    httpStatus: 422,
    frontendHint: '提示「该操作已提交」，不重复发起请求',
    failClosed: false,
  },
  10006: {
    code: 10006,
    segment: 'COMMON',
    message: '请求过于频繁，请稍后重试',
    httpStatus: 429,
    frontendHint: '按 Retry-After 退避重试，按钮置灰倒计时',
    failClosed: false,
  },

  20001: {
    code: 20001,
    segment: 'CONSULT',
    message: '机构协议未签署或已过期',
    httpStatus: 422,
    frontendHint: '提示原因 + 下一步：联系信息科补签《远程医疗服务协议》',
    failClosed: false,
  },
  20002: {
    code: 20002,
    segment: 'CONSULT',
    message: '医师资质无效或已过期',
    httpStatus: 422,
    frontendHint: '提示原因 + 下一步：更换符合资质的医师或补录资质',
    failClosed: false,
  },
  20003: {
    code: 20003,
    segment: 'CONSULT',
    message: '本次为首诊，不得开展互联网复诊会诊',
    httpStatus: 422,
    frontendHint: '提示转线下首诊，并给出「建立首诊记录」入口（R3）',
    failClosed: false,
  },
  20004: {
    code: 20004,
    segment: 'CONSULT',
    message: '会诊科目超出机构获批执业范围',
    httpStatus: 422,
    frontendHint: '回显获批范围，超范围科目不可选',
    failClosed: false,
  },
  20005: {
    code: 20005,
    segment: 'CONSULT',
    message: '状态机非法流转',
    httpStatus: 422,
    frontendHint: '刷新工单状态，按最新可执行动作重绘按钮',
    failClosed: false,
  },

  30001: {
    code: 30001,
    segment: 'EMR',
    message: '未获得该病历的调阅授权',
    httpStatus: 422,
    frontendHint: '提示发起二次授权申请（申请 → 审批 → 重新请求）',
    failClosed: false,
  },
  30002: {
    code: 30002,
    segment: 'EMR',
    message: '授权票据已过期',
    httpStatus: 422,
    frontendHint: '丢弃内存中的明文，触发重新申请授权',
    failClosed: false,
  },
  30003: {
    code: 30003,
    segment: 'EMR',
    message: '越界调阅，已阻断',
    httpStatus: 422,
    frontendHint: '告警提示；后端已写 DENIED 留痕（R8）',
    failClosed: false,
  },

  40001: {
    code: 40001,
    segment: 'RECORD',
    message: '记录关键字段缺失',
    httpStatus: 422,
    frontendHint: '定位缺失字段并高亮（参与人/时间/结论/建议）',
    failClosed: false,
  },
  40002: {
    code: 40002,
    segment: 'RECORD',
    message: '各方签名未齐全，禁止归档',
    httpStatus: 422,
    frontendHint: '高亮未签方并提供催签入口（R6）',
    failClosed: false,
  },
  40003: {
    code: 40003,
    segment: 'RECORD',
    message: '签名校验失败（内容已变更或签名值不符）',
    httpStatus: 422,
    frontendHint: '标记该签名 CONTENT_CHANGED，禁止归档并要求重新签署',
    failClosed: false,
  },

  50001: {
    code: 50001,
    segment: 'AV',
    message: '房间创建失败',
    httpStatus: 422,
    frontendHint: '降级提示 + 重试入口（不阻塞工单本身）',
    failClosed: false,
  },
  50002: {
    code: 50002,
    segment: 'AV',
    message: '参会方数量超限',
    httpStatus: 422,
    frontendHint: '提示当前上限，引导移除或改用旁听',
    failClosed: false,
  },
  50003: {
    code: 50003,
    segment: 'AV',
    message: '录制启动失败',
    httpStatus: 422,
    frontendHint: '常显「未录制」并给出重试入口（R13）',
    failClosed: false,
  },

  60001: {
    code: 60001,
    segment: 'AUDIT',
    message: '系统繁忙，操作未执行',
    httpStatus: 422,
    frontendHint: 'fail-closed：阻断当前操作，不做乐观更新（A-11）',
    failClosed: true,
  },

  90001: {
    code: 90001,
    segment: 'SYSTEM',
    message: '系统内部错误',
    httpStatus: 500,
    frontendHint: '通用错误页 + 展示 traceId 供报障；不展示堆栈',
    failClosed: false,
  },
};

export function getErrorCodeMeta(code: ErrorCode): ErrorCodeMeta {
  return ERROR_CODE_META[code];
}

/** 按号段反查域；未知号段返回 'UNKNOWN'（不得静默当成功） */
export function getErrorSegment(code: number): ErrorSegment {
  if (code === 0) {
    return 'SUCCESS';
  }
  switch (Math.floor(code / 10000)) {
    case 1:
      return 'COMMON';
    case 2:
      return 'CONSULT';
    case 3:
      return 'EMR';
    case 4:
      return 'RECORD';
    case 5:
      return 'AV';
    case 6:
      return 'AUDIT';
    case 9:
      return 'SYSTEM';
    default:
      return 'UNKNOWN';
  }
}

export function isErrorCode(value: number): value is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CODE_META, value);
}

/** 业务失败（走 422 + code 分流） */
export function isBusinessErrorCode(code: number): boolean {
  return code !== 0;
}

/** 敏感动作留痕失败：前端必须阻断 UI，不得乐观更新 */
export function isFailClosedCode(code: number): boolean {
  return isErrorCode(code) && ERROR_CODE_META[code].failClosed;
}

/** 后端异常过滤器用：业务码 → HTTP 状态码 */
export function httpStatusOf(code: number): 422 | 401 | 403 | 429 | 500 {
  return isErrorCode(code) ? ERROR_CODE_META[code].httpStatus : 422;
}
