import { Module } from '@nestjs/common'

import { RtcController } from './rtc.controller'
import { RtcService } from './rtc.service'

/**
 * RTC 信令模块。
 * 只负责「谁在哪个房间」和「把 SDP/ICE 转给谁」，不参与媒体协商，也不碰音视频数据
 * （P2P 建立后媒体走浏览器之间的直连，服务端零带宽）。
 * 不导出 service：其他模块没有理由直接操作信令连接表。
 */
@Module({
  controllers: [RtcController],
  providers: [RtcService],
})
export class RtcModule {}
