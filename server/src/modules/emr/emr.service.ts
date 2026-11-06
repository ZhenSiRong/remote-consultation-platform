import { Injectable } from '@nestjs/common'

import type { EmrPingDto } from './dto/emr.dto'

/**
 * 调阅编排：字段级授权、共享快照生成、越界告警、脱敏数据源（脱敏出口在 common/mask）。
 * service 是唯一事务边界（架构决策.md:752）——读操作也要"日志先行"，与业务同事务。
 */
@Injectable()
export class EmrService {
  ping(): EmrPingDto {
    return { module: 'emr', ok: true }
  }
}
