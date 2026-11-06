import { Controller, Get } from '@nestjs/common'

/** B-07 会扩成三项（进程 / DB / 审计表可写），本步只做进程存活 */
export interface HealthPayload {
  status: 'ok'
  uptime: number
  timestamp: string
}

@Controller()
export class AppController {
  @Get('health')
  health(): HealthPayload {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    }
  }
}
