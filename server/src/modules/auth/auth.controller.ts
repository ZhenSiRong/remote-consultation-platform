import { Controller, Get } from '@nestjs/common'

import { AuthService } from './auth.service'
import type { AuthPingDto } from './dto/auth.dto'

/** controller 只做 HTTP 映射与校验，不写业务判断（架构决策.md:751） */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('ping')
  ping(): AuthPingDto {
    return this.authService.ping()
  }
}
