import request from './request'

/**
 * 会诊工单接口（协议层，不含业务判断）。
 * TODO(C-01/C-02)：响应体统一过 ApiResponse，参数类型改由 `@rcp/shared` 派生。
 */
export function fetchConsultOrders(params: Record<string, unknown>) {
  return request.get('/consult/orders', { params })
}

export function fetchConsultOrder(id: string) {
  return request.get(`/consult/orders/${id}`)
}
