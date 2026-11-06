import { Module } from '@nestjs/common'

import { AuditController } from './audit.controller'
import { AUDIT_REPOSITORY, InMemoryAuditRepository } from './audit.repository'
import { AuditService } from './audit.service'

@Module({
  controllers: [AuditController],
  providers: [AuditService, { provide: AUDIT_REPOSITORY, useClass: InMemoryAuditRepository }],
  /** 模块间只走 service 公开方法或领域事件（规则 6） */
  exports: [AuditService],
})
export class AuditModule {}
