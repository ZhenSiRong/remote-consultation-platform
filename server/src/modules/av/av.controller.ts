import { Controller, Get } from '@nestjs/common'

import { AvService } from './av.service'
import type { AvPingDto } from './dto/av.dto'

/** controller 只做 HTTP 映射与校验，不写业务判断；不得直连 SDK（规则 5） */
@Controller('av')
export class AvController {
  constructor(private readonly avService: AvService) {}

  @Get('ping')
  ping(): AvPingDto {
    return this.avService.ping()
  }
}
