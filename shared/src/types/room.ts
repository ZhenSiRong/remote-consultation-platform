import { z } from 'zod';
import {
  issueRtcTokenSchema,
  recordingStateSchema,
  roomParticipantSchema,
  roomSchema,
  roomStatusSchema,
  recordingStatusSchema,
  rtcTokenSchema,
} from '../schemas/av';

/**
 * 音视频域实体类型（由 schemas/av 派生）
 * `RoomRole` / `RoomPresenceState` 的声明在 dict/room-presence。
 */

export type Room = z.infer<typeof roomSchema>;
export type RoomParticipant = z.infer<typeof roomParticipantSchema>;
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type RecordingState = z.infer<typeof recordingStateSchema>;
export type RecordingStatus = z.infer<typeof recordingStatusSchema>;

/** 入会凭证（HTTP DTO；port 层的凭证形状见 ports/rtc-provider 的 RtcIssuedToken） */
export type RtcToken = z.infer<typeof rtcTokenSchema>;
export type IssueRtcTokenRequest = z.input<typeof issueRtcTokenSchema>;
