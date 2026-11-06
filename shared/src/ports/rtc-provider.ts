import type { RoomRole } from '../dict/room-presence';

/**
 * 音视频能力 port —— 架构决策.md 3.8.5（P-02）
 *
 * 只定接口，不实现。fake / 厂商实现都在 `server/src/adapters/video/`（B-08）。
 *
 * 三条硬约束：
 * 1. **不出现厂商专有名词**（判据：port 里出现 `agoraChannelId` 这类字段就说明抽象漏了）。
 * 2. SDK 的异步回调必须先归一为内部事件（`room.joined` / `recording.started` / `peer.left`），
 *    业务只订阅内部事件 —— 否则换 SDK 会改业务逻辑。
 * 3. 实现必须能**主动模拟失败**（建房间超时 / 断连 / 忙线 / 录制启动失败），
 *    否则 5xxxx 的负向用例无法验收。
 */

export interface RtcRoomSpec {
  consultationId: string;
  orgId: string;
  /** F2 验收：单场支持 ≥5 方 */
  maxParticipants: number;
  /** 是否随会诊生命周期自动录制（R13） */
  recording: boolean;
  /** 业务侧超时预算（毫秒）；F2 要求建房间 < 10 秒 */
  timeoutMs?: number;
}

export interface RtcRoomHandle {
  roomId: string;
  roomNo: string;
  createdAt: string;
}

export interface RtcTokenRequest {
  roomId: string;
  participantId: string;
  role: RoomRole;
  /** 默认 30 分钟，上限 4 小时 */
  ttlSeconds: number;
}

export interface RtcIssuedToken {
  token: string;
  roomId: string;
  participantId: string;
  expiresAt: string;
}

export interface RtcRecordingHandle {
  recordingId: string;
  roomId: string;
  startedAt: string;
  /** 录制文件引用（短期凭证，前端不得长期持有，3.7D） */
  storageRef: string;
}

export interface RtcRecordingResult extends RtcRecordingHandle {
  stoppedAt: string;
  durationSeconds: number;
}

/** 归一后的内部事件名（3.8.5 规则 5） */
export const RTC_EVENT_NAMES = [
  'room.joined',
  'room.left',
  'peer.joined',
  'peer.left',
  'peer.busy',
  'peer.timeout',
  'recording.started',
  'recording.stopped',
  'recording.failed',
  'connection.lost',
  'connection.restored',
] as const;

export type RtcEventName = (typeof RTC_EVENT_NAMES)[number];

export interface RtcEvent {
  name: RtcEventName;
  roomId: string;
  participantId?: string;
  at: string;
  /** 归一后的补充说明，不含厂商原始结构 */
  detail?: string;
}

export type RtcErrorCode =
  | 'ROOM_CREATE_TIMEOUT'
  | 'ROOM_NOT_FOUND'
  | 'PARTICIPANT_LIMIT_EXCEEDED'
  | 'PEER_BUSY'
  | 'RECORDING_START_FAILED'
  | 'RECORDING_STOP_FAILED'
  | 'CONNECTION_LOST'
  | 'PROVIDER_UNAVAILABLE';

export class RtcProviderError extends Error {
  readonly code: RtcErrorCode;

  constructor(code: RtcErrorCode, message: string) {
    super(message);
    this.name = 'RtcProviderError';
    this.code = code;
  }
}

export type RtcEventListener = (event: RtcEvent) => void;

export interface RtcProvider {
  createRoom(spec: RtcRoomSpec): Promise<RtcRoomHandle>;
  issueToken(request: RtcTokenRequest): Promise<RtcIssuedToken>;
  closeRoom(roomId: string): Promise<void>;
  startRecording(roomId: string): Promise<RtcRecordingHandle>;
  stopRecording(roomId: string): Promise<RtcRecordingResult>;
  /** 返回取消订阅函数 */
  onEvent(listener: RtcEventListener): () => void;
}
