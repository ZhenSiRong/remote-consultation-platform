import { Injectable } from '@nestjs/common'

import type { OrgPingDto } from './dto/org.dto'

/**
 * 机构、协议、医师资质（合规主体在后端，架构决策.md:710）。
 * service 是唯一事务边界（架构决策.md:752）。
 */
@Injectable()
export class OrgService {
  ping(): OrgPingDto {
    return { module: 'org', ok: true }
  }
}
