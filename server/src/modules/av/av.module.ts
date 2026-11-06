import { Module } from '@nestjs/common'

import { AvController } from './av.controller'
import { AV_REPOSITORY, InMemoryAvRepository } from './av.repository'
import { AvService } from './av.service'

@Module({
  controllers: [AvController],
  providers: [AvService, { provide: AV_REPOSITORY, useClass: InMemoryAvRepository }],
  /** 模块间只走 service 公开方法或领域事件（规则 6），所以只导出 service */
  exports: [AvService],
})
export class AvModule {}
