import { Controller, Get } from '@nestjs/common'

import { ConsultService } from './consult.service'
import type { ConsultPingDto } from './dto/consult.dto'

/** controller 只做 HTTP 映射与校验，不写业务判断（架构决策.md:751） */
@Controller('consult')
export class ConsultController {
  constructor(private readonly consultService: ConsultService) {}

  @Get('ping')
  ping(): ConsultPingDto {
    return this.consultService.ping()
  }
}
