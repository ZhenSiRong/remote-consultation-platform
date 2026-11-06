/**
 * 语音转写 adapter（US-REC-06，V3）。ASR 是外部服务调用，不是主后端职责（架构决策.md:647）：
 * 真要做时以独立 Python 服务或厂商 ASR API 接入，业务只认本 port。
 * 时间戳由服务端统一授时，前端只提交相对序号（3.7 C）。
 */
export interface TranscriptSegment {
  startMs: number
  endMs: number
  text: string
}

export interface AsrProvider {
  transcribe(objectKey: string): Promise<readonly TranscriptSegment[]>
}

export const ASR_PROVIDER = Symbol('ASR_PROVIDER')

/** 骨架占位：固定返回一段假转写 */
export class FakeAsrProvider implements AsrProvider {
  /** 置为 true 后，下一次调用即抛错（模拟转写失败） */
  failNext = false

  async transcribe(objectKey: string): Promise<readonly TranscriptSegment[]> {
    if (this.failNext) {
      this.failNext = false
      throw new Error('FakeAsrProvider simulated failure: transcription failed')
    }
    return [{ startMs: 0, endMs: 1000, text: `fake transcript for ${objectKey}` }]
  }
}
