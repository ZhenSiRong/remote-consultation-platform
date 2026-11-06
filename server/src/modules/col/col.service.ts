import { Injectable } from '@nestjs/common'

import type { ColPingDto } from './dto/col.dto'

/**
 * 会场角色与发言权、标注同步、时序事件总线（时间戳由服务端统一授时）。
 * av / record 通过领域事件投递到这里（规则 6：模块间不横向读表）。
 * service 是唯一事务边界（架构决策.md:752）。
 */
@Injectable()
export class ColService {
  ping(): ColPingDto {
    return { module: 'col', ok: true }
  }
}
