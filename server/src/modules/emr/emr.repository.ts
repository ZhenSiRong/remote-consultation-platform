import { Injectable } from '@nestjs/common'

/**
 * 调阅、授权、共享快照的持久化端口；Prisma 实现将来放 emr.repository.prisma.ts。
 * 本步是内存占位，不接数据库。
 */
export interface EmrRecord {
  id: string
}

export interface EmrRepository {
  findById(id: string): Promise<EmrRecord | null>
}

export const EMR_REPOSITORY = Symbol('EMR_REPOSITORY')

@Injectable()
export class InMemoryEmrRepository implements EmrRepository {
  private readonly rows = new Map<string, EmrRecord>()

  async findById(id: string): Promise<EmrRecord | null> {
    return this.rows.get(id) ?? null
  }
}
