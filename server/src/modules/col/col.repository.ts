import { Injectable } from '@nestjs/common'

/**
 * 会场角色与标注、时序事件的持久化端口；Prisma 实现将来放 col.repository.prisma.ts。
 * 本步是内存占位，不接数据库。
 */
export interface ColRecord {
  id: string
}

export interface ColRepository {
  findById(id: string): Promise<ColRecord | null>
}

export const COL_REPOSITORY = Symbol('COL_REPOSITORY')

@Injectable()
export class InMemoryColRepository implements ColRepository {
  private readonly rows = new Map<string, ColRecord>()

  async findById(id: string): Promise<ColRecord | null> {
    return this.rows.get(id) ?? null
  }
}
