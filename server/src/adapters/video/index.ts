import {
  RtcProviderError,
  type RtcEvent,
  type RtcEventListener,
  type RtcIssuedToken,
  type RtcProvider,
  type RtcRecordingHandle,
  type RtcRecordingResult,
  type RtcRoomHandle,
  type RtcRoomSpec,
  type RtcTokenRequest,
} from '@rcp/shared'

/**
 * 音视频 adapter（架构决策.md:914，P-02 未定）。
 *
 * **契约只在 `shared/src/ports/rtc-provider.ts` 定义一份**，本文件只提供 fake 实现。
 * 之前这里复制过一份同名 `RtcProvider`，但方法签名与契约不一致（`issueToken(roomId, actorId)`
 * vs 契约的 `issueToken(request)`），换厂商实现时会踩两套接口的坑。已收敛为 import type。
 *
 * 注入方式：`VIDEO_PROVIDER=fake|vendor` + Nest 工厂，业务里禁止 `if (provider === 'x')`。
 */
export { RTC_PROVIDER } from './token'

/**
 * 骨架占位：内存房间表 + 假 token；真实实现等 P-02 决策（W8 末）。
 *
 * `failNextWith` 是硬要求（契约 3.8.5 规则 3）：不模拟失败，`5xxxx` 段的负向用例
 * 就永远只能靠「假设它能失败」来写，等于没验收。
 */
export class FakeRtcProvider implements RtcProvider {
  private readonly rooms = new Map<string, RtcRoomHandle>()

  private readonly recordings = new Map<string, RtcRecordingHandle>()

  private readonly listeners = new Set<RtcEventListener>()

  /** 置为某错误码后，下一次调用即抛 `RtcProviderError`（模拟超时 / 断连 / 忙线） */
  failNextWith: RtcProviderError['code'] | null = null

  async createRoom(spec: RtcRoomSpec): Promise<RtcRoomHandle> {
    this.raiseIfArmed()
    if (spec.maxParticipants < 2) {
      // 契约要求单场至少 2 方，配错直接拒绝而不是静默放过
      throw new RtcProviderError('PROVIDER_UNAVAILABLE', '会场人数上限不得小于 2')
    }
    const seq = this.rooms.size + 1
    const handle: RtcRoomHandle = {
      roomId: `fake-room-${spec.consultationId}`,
      roomNo: `ROOM2026${String(seq).padStart(4, '0')}`,
      createdAt: new Date().toISOString(),
    }
    this.rooms.set(handle.roomId, handle)
    this.emit({ name: 'room.joined', roomId: handle.roomId, at: handle.createdAt })
    return handle
  }

  async issueToken(request: RtcTokenRequest): Promise<RtcIssuedToken> {
    this.raiseIfArmed()
    if (!this.rooms.has(request.roomId)) {
      // 房间不存在时给 ROOM_NOT_FOUND，让调用方能区分「还没建房间」与「厂商挂了」
      throw new RtcProviderError('ROOM_NOT_FOUND', `会场不存在：${request.roomId}`)
    }
    return {
      token: `fake-token:${request.roomId}:${request.participantId}`,
      roomId: request.roomId,
      participantId: request.participantId,
      expiresAt: new Date(Date.now() + request.ttlSeconds * 1000).toISOString(),
    }
  }

  async closeRoom(roomId: string): Promise<void> {
    this.raiseIfArmed()
    if (!this.rooms.delete(roomId)) {
      throw new RtcProviderError('ROOM_NOT_FOUND', `会场不存在：${roomId}`)
    }
    this.emit({ name: 'room.left', roomId, at: new Date().toISOString() })
  }

  async startRecording(roomId: string): Promise<RtcRecordingHandle> {
    this.raiseIfArmed()
    if (!this.rooms.has(roomId)) {
      throw new RtcProviderError('ROOM_NOT_FOUND', `会场不存在：${roomId}`)
    }
    const handle: RtcRecordingHandle = {
      recordingId: `fake-recording-${roomId}`,
      roomId,
      startedAt: new Date().toISOString(),
      // 短期凭证，前端不得长期持有（3.7D）
      storageRef: `fake://recording/${roomId}`,
    }
    this.recordings.set(roomId, handle)
    this.emit({ name: 'recording.started', roomId, at: handle.startedAt })
    return handle
  }

  async stopRecording(roomId: string): Promise<RtcRecordingResult> {
    this.raiseIfArmed()
    const handle = this.recordings.get(roomId)
    if (!handle) {
      throw new RtcProviderError('RECORDING_STOP_FAILED', `会场未在录制：${roomId}`)
    }
    const stoppedAt = new Date()
    const result: RtcRecordingResult = {
      ...handle,
      stoppedAt: stoppedAt.toISOString(),
      durationSeconds: Math.max(0, Math.round((stoppedAt.getTime() - Date.parse(handle.startedAt)) / 1000)),
    }
    this.recordings.delete(roomId)
    this.emit({ name: 'recording.stopped', roomId, at: result.stoppedAt })
    return result
  }

  onEvent(listener: RtcEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 事件必须归一成 `RTC_EVENT_NAMES` 里的名字，业务只订阅内部事件（契约 3.8.5 规则 2） */
  private emit(event: RtcEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // 订阅方异常不能影响其他订阅方，也不能影响主流程
      }
    }
  }

  private raiseIfArmed(): void {
    if (this.failNextWith) {
      const code = this.failNextWith
      this.failNextWith = null
      throw new RtcProviderError(code, `FakeRtcProvider 模拟失败：${code}`)
    }
  }
}
