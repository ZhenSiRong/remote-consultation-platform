import { Injectable } from '@nestjs/common'

import type { AuthPingDto } from './dto/auth.dto'

/**
 * 登录、会话、token 刷新。
 * service 是唯一事务边界（架构决策.md:752）：后续所有用例的事务开在这里，不在 controller。
 */
@Injectable()
export class AuthService {
  ping(): AuthPingDto {
    return { module: 'auth', ok: true }
  }
}
