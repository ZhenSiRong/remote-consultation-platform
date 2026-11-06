import { Controller, Get } from '@nestjs/common'

import type { OrgPingDto } from './dto/org.dto'
import { OrgService } from './org.service'

/** controller 只做 HTTP 映射与校验，不写业务判断（架构决策.md:751） */
@Controller('org')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get('ping')
  ping(): OrgPingDto {
    return this.orgService.ping()
  }
}
