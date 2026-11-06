import { Injectable } from '@nestjs/common'

/**
 * 工单 + 状态机（F1）的持久化端口；Prisma 实现将来放 consult.repository.prisma.ts。
 * 本步是内存占位，不接数据库。
 */
export interface ConsultRecord {
  id: string
}

export interface ConsultRepository {
  findById(id: string): Promise<ConsultRecord | null>
}

export const CONSULT_REPOSITORY = Symbol('CONSULT_REPOSITORY')

@Injectable()
export class InMemoryConsultRepository implements ConsultRepository {
  private readonly rows = new Map<string, ConsultRecord>()

  async findById(id: string): Promise<ConsultRecord | null> {
    return this.rows.get(id) ?? null
  }
}
