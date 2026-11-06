import { httpGet, httpPost } from './request'
import type { Room, RoomRole } from '@rcp/shared'

/**
 * 会诊室（音视频会场）接口 —— 协议层，不含业务判断。
 *
 * 与 src/api/consult.ts 同一套写法：只做「路径 + 类型」，不做状态判断。
 * 会场能不能控制别人、录制能不能启动，一律以接口返回的错误码为准
 * （5xxxx 段 = 音视频域，见 shared/src/errors/codes.ts）。
 *
 * 所有写操作都返回**操作后的整个 Room**，而不是只回一个成功标记：
 * 会场是多人共享的实时态，静音别人之后自己的页面也要跟着刷新（对方变灰、自己没变），
 * 只回 ok 的话页面还得再发一次 GET，两次请求之间会闪一帧旧数据。
 */

export interface JoinRoomInput {
  participantId: string
  role: RoomRole
}

export interface MediaStateInput {
  micMuted?: boolean
  cameraOn?: boolean
}

/** 会场控制动作：静音 / 解除静音 / 移出会场（US-COL-01 只给主持人） */
export type RoomControlAction = 'MUTE' | 'UNMUTE' | 'REMOVE'

/**
 * GET /consultations/:id/room —— 按会诊单取会场，会场不存在时后端懒创建。
 * 不存在抛 ApiError(10004)，建会场失败抛 ApiError(50001)。
 */
export function fetchRoomByConsultation(consultationId: string): Promise<Room> {
  return httpGet<Room>(`/consultations/${encodeURIComponent(consultationId)}/room`)
}

/**
 * POST /rooms/:id/join —— 入会。
 * 人数超上限抛 ApiError(50002)（契约 F2：单场 ≥5 方）。
 */
export function joinRoom(roomId: string, input: JoinRoomInput): Promise<Room> {
  return httpPost<Room>(`/rooms/${encodeURIComponent(roomId)}/join`, input)
}

/** POST /rooms/:id/leave —— 离会；全员离会后会场自动关闭 */
export function leaveRoom(roomId: string, participantId: string): Promise<Room> {
  return httpPost<Room>(`/rooms/${encodeURIComponent(roomId)}/leave`, { participantId })
}

/**
 * POST /rooms/:id/media —— 更新自己的麦克风/摄像头开关。
 * 只传要改的字段：传 undefined 表示「这次不动它」，避免把未变更的开关覆盖回默认值。
 */
export function updateMediaState(
  roomId: string,
  participantId: string,
  input: MediaStateInput,
): Promise<Room> {
  return httpPost<Room>(`/rooms/${encodeURIComponent(roomId)}/media`, {
    participantId,
    micMuted: input.micMuted,
    cameraOn: input.cameraOn,
  })
}

/**
 * POST /rooms/:id/control —— 对他人执行会场控制。
 * 非主持人调用抛 ApiError(10003)，对自己操作抛 ApiError(10001)。
 */
export function controlParticipant(
  roomId: string,
  targetId: string,
  action: RoomControlAction,
): Promise<Room> {
  return httpPost<Room>(`/rooms/${encodeURIComponent(roomId)}/control`, { targetId, action })
}

/**
 * POST /rooms/:id/recording/start —— 开始录制（R13）。
 * 无可用视频流时抛 ApiError(50003)，页面须常显「未录制」并给重试入口。
 */
export function startRecording(roomId: string): Promise<Room> {
  return httpPost<Room>(`/rooms/${encodeURIComponent(roomId)}/recording/start`)
}

/** POST /rooms/:id/recording/stop —— 停止录制 */
export function stopRecording(roomId: string): Promise<Room> {
  return httpPost<Room>(`/rooms/${encodeURIComponent(roomId)}/recording/stop`)
}
