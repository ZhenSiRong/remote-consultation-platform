import { Injectable } from '@nestjs/common'

/**
 * repository 只暴露接口（架构决策.md:754）；Prisma 实现将来放 auth.repository.prisma.ts。
 * 本步是内存占位，不接数据库（B-06 才有 schema）。
 */
export interface AuthRecord {
  id: string
}

export interface AuthRepository {
  findById(id: string): Promise<AuthRecord | null>
}

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY')

@Injectable()
export class InMemoryAuthRepository implements AuthRepository {
  private readonly rows = new Map<string, AuthRecord>()

  async findById(id: string): Promise<AuthRecord | null> {
    return this.rows.get(id) ?? null
  }
}
