import { Injectable } from '@nestjs/common'

/**
 * 记录版本、署名、签署、归档的持久化端口；Prisma 实现将来放 record.repository.prisma.ts。
 * 记录版本不可变（只 INSERT），本步是内存占位，不接数据库。
 */
export interface RecordRecord {
  id: string
}

export interface RecordRepository {
  findById(id: string): Promise<RecordRecord | null>
}

export const RECORD_REPOSITORY = Symbol('RECORD_REPOSITORY')

@Injectable()
export class InMemoryRecordRepository implements RecordRepository {
  private readonly rows = new Map<string, RecordRecord>()

  async findById(id: string): Promise<RecordRecord | null> {
    return this.rows.get(id) ?? null
  }
}
