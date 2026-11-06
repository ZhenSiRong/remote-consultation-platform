import { Module } from '@nestjs/common'

import { RecordController } from './record.controller'
import { InMemoryRecordRepository, RECORD_REPOSITORY } from './record.repository'
import { RecordService } from './record.service'

@Module({
  controllers: [RecordController],
  providers: [RecordService, { provide: RECORD_REPOSITORY, useClass: InMemoryRecordRepository }],
  /** 模块间只走 service 公开方法或领域事件（规则 6） */
  exports: [RecordService],
})
export class RecordModule {}
