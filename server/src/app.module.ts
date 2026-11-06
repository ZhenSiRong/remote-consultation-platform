import { Module } from '@nestjs/common'

import { AppController } from './app.controller'
import { AuditModule } from './modules/audit/audit.module'
import { AuthModule } from './modules/auth/auth.module'
import { AvModule } from './modules/av/av.module'
import { ColModule } from './modules/col/col.module'
import { ConsultModule } from './modules/consult/consult.module'
import { EmrModule } from './modules/emr/emr.module'
import { OrgModule } from './modules/org/org.module'
import { RecordModule } from './modules/record/record.module'
import { RtcModule } from './modules/rtc/rtc.module'

/**
 * 根模块：只做装配，不写业务。
 * 8 个业务模块（架构决策.md:729-737）全部注册，保证骨架启动即验证 DI 与 import 路径。
 * common/ 是内核（非模块，按需 @Injectable / 中间件注入），adapters/ 是外部能力（port & adapter）。
 */
@Module({
  imports: [
    AuthModule,
    OrgModule,
    ConsultModule,
    AvModule,
    EmrModule,
    RecordModule,
    ColModule,
    AuditModule,
    // 信令不属于那 8 个业务域，但视频会诊室要用，故单独注册（无状态、无 Prisma 依赖）
    RtcModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
