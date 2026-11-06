/**
 * 音视频 adapter（架构决策.md:914，P-02 未定）。
 * port 应定义在 shared/ports（3.8.5 规则 1），B-04 产出后改为 import type；
 * **本地接口不得出现厂商专有名词**（否则抽象漏了，换 SDK 会拖垮业务）。
 * 注入方式：VIDEO_PROVIDER=fake|vendor + Nest useClass 工厂，业务里禁止 if (provider === 'x')。
 */
export interface RtcRoomOptions {
  consultationId: string
  /** F2 指标：≥5 方 */
  participants: number
}

export interface RtcRoom {
  roomId: string
  createdAt: string
}

export interface RtcToken {
  token: string
  expiresAt: string
}

/** fake 必须能模拟失败（3.8.5 规则 3），否则 5xxxx 的负向用例无法验收 */
export type ProviderFailure = 'timeout' | 'disconnected' | 'busy'

export interface RtcProvider {
  createRoom(options: RtcRoomOptions): Promise<RtcRoom>
  issueToken(roomId: string, actorId: string): Promise<RtcToken>
  closeRoom(roomId: string): Promise<void>
  startRecording(roomId: string): Promise<{ recordingId: string }>
  stopRecording(roomId: string): Promise<void>
}

export const RTC_PROVIDER = Symbol('RTC_PROVIDER')

/** 骨架占位：内存房间表 + 假 token；真实实现等 P-02 决策（W8 末） */
export class FakeRtcProvider implements RtcProvider {
  private readonly rooms = new Map<string, RtcRoom>()

  /** 置为某值后，下一次调用即抛错（模拟超时 / 断连 / 忙线） */
  failNextWith: ProviderFailure | null = null

  async createRoom(options: RtcRoomOptions): Promise<RtcRoom> {
    this.raiseIfArmed()
    const room: RtcRoom = {
      roomId: `fake-room-${options.consultationId}`,
      createdAt: new Date().toISOString(),
    }
    this.rooms.set(room.roomId, room)
    return room
  }

  async issueToken(roomId: string, actorId: string): Promise<RtcToken> {
    this.raiseIfArmed()
    return {
      token: `fake-token:${roomId}:${actorId}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
  }

  async closeRoom(roomId: string): Promise<void> {
    this.raiseIfArmed()
    this.rooms.delete(roomId)
  }

  async startRecording(roomId: string): Promise<{ recordingId: string }> {
    this.raiseIfArmed()
    return { recordingId: `fake-recording-${roomId}` }
  }

  async stopRecording(_roomId: string): Promise<void> {
    this.raiseIfArmed()
  }

  private raiseIfArmed(): void {
    if (this.failNextWith) {
      const failure = this.failNextWith
      this.failNextWith = null
      throw new Error(`FakeRtcProvider simulated failure: ${failure}`)
    }
  }
}
