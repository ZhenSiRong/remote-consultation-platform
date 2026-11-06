import 'reflect-metadata'

import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'

const DEFAULT_PORT = 3000

/** PORT 缺省或非法时回落 3000（B-07 会把 env 校验收敛成 fail-fast） */
function resolvePort(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  app.enableShutdownHooks()

  const port = resolvePort(process.env.PORT)
  await app.listen(port)

  Logger.log(`RCP server listening on http://localhost:${port}`, 'Bootstrap')
}

void bootstrap()
