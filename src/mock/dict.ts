import { ERROR_CODES } from '@rcp/shared'
import type { ConsultDictionaries } from '@/api/consult'
import type { MockRoute } from './adapter'
import { DOCTOR_OPTIONS, ORG_OPTIONS } from './fixtures'

/**
 * 字典接口（机构 / 医师）。
 *
 * 为什么单独给一个接口，而不是往 ConsultOrder 里塞 orgName / doctorName：
 * `consultOrderSchema` 是冻结契约，`parse()` 会把多余字段 strip 掉，塞不进去；
 * 而且真后端本来就只回 id——机构改名不该改写历史单据的展示，
 * 名称必须由字典在展示层解析。所以这是正确做法，不是绕路。
 *
 * 数据在模块加载时算好：字典是静态的，没必要每次请求都 map 一遍。
 */
const DICTIONARIES: ConsultDictionaries = {
  orgs: ORG_OPTIONS.map(({ id, name }) => ({ id, name })),
  // qualificationOk 是选择器的内部判断依据，不下发给详情页
  doctors: DOCTOR_OPTIONS.map(({ id, name, title, orgId }) => ({ id, name, title, orgId })),
}

export const dictRoutes: MockRoute[] = [
  {
    method: 'GET',
    pattern: '/dictionaries',
    handler: () => ({ code: ERROR_CODES.SUCCESS, message: 'ok', data: DICTIONARIES }),
  },
]
