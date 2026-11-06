import { Injectable } from '@nestjs/common'

import type { RecordPingDto } from './dto/record.dto'

/**
 * 记录版本（不可变）、分区署名、签署、归档前置校验。
 * 签署只签摘要不签正文（R6）；签名实现走 adapters/sign 的 port，本模块不 import 厂商 SDK。
 * service 是唯一事务边界（架构决策.md:752）——签名记录与 SIGN 留痕必须同一事务。
 */
@Injectable()
export class RecordService {
  ping(): RecordPingDto {
    return { module: 'record', ok: true }
  }
}
