/**
 * 定时任务（架构决策.md:740）：超时扫描、归档补偿、审计 outbox 重试。
 * 本步只定任务名与执行契约；调度器（@nestjs/schedule）与具体实现在 B-1x 接入。
 * 注意：审计 outbox 重试只补"非敏感动作"（敏感动作走 fail-closed，不允许事后补写）。
 */
export const JOB_NAMES = ['consult-timeout-scan', 'archive-compensate', 'audit-outbox-retry'] as const

export type JobName = (typeof JOB_NAMES)[number]

export interface Job {
  readonly name: JobName
  run(): Promise<void>
}
