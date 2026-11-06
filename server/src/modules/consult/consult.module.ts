import { Module } from '@nestjs/common'

import { ConsultController } from './consult.controller'
import { CONSULT_REPOSITORY, InMemoryConsultRepository } from './consult.repository'
import { ConsultService } from './consult.service'

@Module({
  controllers: [ConsultController],
  providers: [ConsultService, { provide: CONSULT_REPOSITORY, useClass: InMemoryConsultRepository }],
  /** 模块间只走 service 公开方法或领域事件（规则 6），所以只导出 service */
  exports: [ConsultService],
})
export class ConsultModule {}
