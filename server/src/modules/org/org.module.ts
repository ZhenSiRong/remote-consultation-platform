import { Module } from '@nestjs/common'

import { OrgController } from './org.controller'
import { InMemoryOrgRepository, ORG_REPOSITORY } from './org.repository'
import { OrgService } from './org.service'

@Module({
  controllers: [OrgController],
  providers: [OrgService, { provide: ORG_REPOSITORY, useClass: InMemoryOrgRepository }],
  /** 模块间只走 service 公开方法或领域事件（规则 6），所以只导出 service */
  exports: [OrgService],
})
export class OrgModule {}
