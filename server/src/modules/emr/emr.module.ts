import { Module } from '@nestjs/common'

import { EmrController } from './emr.controller'
import { EMR_REPOSITORY, InMemoryEmrRepository } from './emr.repository'
import { EmrService } from './emr.service'

@Module({
  controllers: [EmrController],
  providers: [EmrService, { provide: EMR_REPOSITORY, useClass: InMemoryEmrRepository }],
  /** 模块间只走 service 公开方法或领域事件（规则 6）——record 取快照就调 EmrService */
  exports: [EmrService],
})
export class EmrModule {}
