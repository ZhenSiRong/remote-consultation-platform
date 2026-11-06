import { Injectable } from '@nestjs/common'

import type { AvPingDto } from './dto/av.dto'

/**
 * 房间生命周期、RTC token 签发、录制编排、SDK 回调归一（厂商能力只经 adapters/video 的 port 调用）。
 * service 是唯一事务边界（架构决策.md:752）。
 */
@Injectable()
export class AvService {
  ping(): AvPingDto {
    return { module: 'av', ok: true }
  }
}
