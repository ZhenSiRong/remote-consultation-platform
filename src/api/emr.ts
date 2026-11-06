import request from './request'

/** 病历共享接口（协议层）。TODO(EMR 系列)：授权调阅、共享快照。 */
export function fetchPatientRecord(patientId: string) {
  return request.get(`/patients/${patientId}/record`)
}
