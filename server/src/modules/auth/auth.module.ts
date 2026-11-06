import { Module } from '@nestjs/common'

import { AuthController } from './auth.controller'
import { AUTH_REPOSITORY, InMemoryAuthRepository } from './auth.repository'
import { AuthService } from './auth.service'

@Module({
  controllers: [AuthController],
  providers: [AuthService, { provide: AUTH_REPOSITORY, useClass: InMemoryAuthRepository }],
  /** 模块间只走 service 公开方法或领域事件（规则 6），所以只导出 service */
  exports: [AuthService],
})
export class AuthModule {}
