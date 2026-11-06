import { Controller, Get } from '@nestjs/common'

import { ColService } from './col.service'
import type { ColPingDto } from './dto/col.dto'

/** controller 只做 HTTP 映射与校验，不写业务判断（架构决策.md:751） */
@Controller('col')
export class ColController {
  constructor(private readonly colService: ColService) {}

  @Get('ping')
  ping(): ColPingDto {
    return this.colService.ping()
  }
}
