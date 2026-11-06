import { Controller, Get } from '@nestjs/common'

import type { RecordPingDto } from './dto/record.dto'
import { RecordService } from './record.service'

/** controller 只做 HTTP 映射与校验，不写业务判断（架构决策.md:751） */
@Controller('record')
export class RecordController {
  constructor(private readonly recordService: RecordService) {}

  @Get('ping')
  ping(): RecordPingDto {
    return this.recordService.ping()
  }
}
