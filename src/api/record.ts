import request from './request'

/** 会诊记录接口（协议层）。TODO(REC 系列)：结构化记录、签署、归档。 */
export function fetchRecords(params: Record<string, unknown>) {
  return request.get('/records', { params })
}
