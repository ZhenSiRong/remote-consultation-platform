import { Injectable } from '@nestjs/common'

/**
 * 房间、邀约、参会方的持久化端口；Prisma 实现将来放 av.repository.prisma.ts。
 * 本步是内存占位，不接数据库。
 */
export interface AvRecord {
  id: string
}

export interface AvRepository {
  findById(id: string): Promise<AvRecord | null>
}

export const AV_REPOSITORY = Symbol('AV_REPOSITORY')

@Injectable()
export class InMemoryAvRepository implements AvRepository {
  private readonly rows = new Map<string, AvRecord>()

  async findById(id: string): Promise<AvRecord | null> {
    return this.rows.get(id) ?? null
  }
}
