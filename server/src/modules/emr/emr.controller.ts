import { Controller, Get } from '@nestjs/common'

import type { EmrPingDto } from './dto/emr.dto'
import { EmrService } from './emr.service'

/** controller 只做 HTTP 映射与校验，不写业务判断（架构决策.md:751） */
@Controller('emr')
export class EmrController {
  constructor(private readonly emrService: EmrService) {}

  @Get('ping')
  ping(): EmrPingDto {
    return this.emrService.ping()
  }
}
