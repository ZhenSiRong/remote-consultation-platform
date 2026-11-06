import { Controller, Get } from '@nestjs/common'

import { AuditService } from './audit.service'
import type { AuditPingDto } from './dto/audit.dto'

/** controller 只做 HTTP 映射与校验；本模块只读，不提供写接口 */
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('ping')
  ping(): AuditPingDto {
    return this.auditService.ping()
  }
}
