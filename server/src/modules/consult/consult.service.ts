import { Injectable } from '@nestjs/common'

import type { ConsultPingDto } from './dto/consult.dto'

/**
 * 工单主链编排：状态迁移、R1/R2/R3/R16 四项准入校验都落在这里（状态机实现在 ./domain）。
 * service 是唯一事务边界（架构决策.md:752）。
 */
@Injectable()
export class ConsultService {
  ping(): ConsultPingDto {
    return { module: 'consult', ok: true }
  }
}
