/**
 * 会场时序事件的纯逻辑（架构决策.md:601）：语音转写片段、标注帧、文字意见共用一条时间轴。
 * 纯 TS：不 import Nest / Prisma（规则 3）。
 *
 * TODO(B-1x)：内部事件归一（room.joined / recording.started / peer.left）与相对序号 → 服务端时间戳映射。
 * 本步只留结构。
 */
export type ColEventType = 'room.joined' | 'room.left' | 'recording.started' | 'recording.stopped' | 'annotation.added'

export interface ColEvent {
  type: ColEventType
  /** 客户端只提交相对序号 + 本地时刻，服务端归一（3.7 C） */
  sequence: number
  clientTime?: string
}

export interface NormalizedEvent extends ColEvent {
  serverTime: string
}
