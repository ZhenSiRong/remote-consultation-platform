import { Module } from '@nestjs/common'

import { ColController } from './col.controller'
import { COL_REPOSITORY, InMemoryColRepository } from './col.repository'
import { ColService } from './col.service'

@Module({
  controllers: [ColController],
  providers: [ColService, { provide: COL_REPOSITORY, useClass: InMemoryColRepository }],
  /** 模块间只走 service 公开方法或领域事件（规则 6） */
  exports: [ColService],
})
export class ColModule {}
