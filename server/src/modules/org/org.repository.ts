import { Injectable } from '@nestjs/common'

/**
 * 机构、协议、医师资质的持久化端口；Prisma 实现将来放 org.repository.prisma.ts。
 * 本步是内存占位，不接数据库。
 */
export interface OrgRecord {
  id: string
}

export interface OrgRepository {
  findById(id: string): Promise<OrgRecord | null>
}

export const ORG_REPOSITORY = Symbol('ORG_REPOSITORY')

@Injectable()
export class InMemoryOrgRepository implements OrgRepository {
  private readonly rows = new Map<string, OrgRecord>()

  async findById(id: string): Promise<OrgRecord | null> {
    return this.rows.get(id) ?? null
  }
}
