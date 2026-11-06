import request from './request'

/** 合规审计接口（协议层）。TODO(审计系列)：留痕检索、授权清单、机构协议。 */
export function fetchAuditLogs(params: Record<string, unknown>) {
  return request.get('/audit/logs', { params })
}
