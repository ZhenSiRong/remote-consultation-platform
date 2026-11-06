import { z } from 'zod';
import { ROOM_PRESENCE_STATES, ROOM_ROLES } from '../dict/room-presence';
import { idSchema, isoDateTimeSchema } from './common';

/**
 * 音视频域（av）—— 3.5A / US-AV-01·03·06 / US-COL-01
 * 会场运行态与工单状态机**分离**（3.3D）：room 有独立的生命周期与参会方在线态。
 */

export const ROOM_STATUSES = ['CREATED', 'OPEN', 'CLOSED'] as const;
export const roomStatusSchema = z.enum(ROOM_STATUSES);

export const RECORDING_STATUSES = ['IDLE', 'RECORDING', 'STOPPED', 'FAILED'] as const;
export const recordingStatusSchema = z.enum(RECORDING_STATUSES);

export const roomRoleSchema = z.enum(ROOM_ROLES);
export const roomPresenceSchema = z.enum(ROOM_PRESENCE_STATES);

export const recordingStateSchema = z.object({
  status: recordingStatusSchema,
  recordingId: idSchema.nullable(),
  startedAt: isoDateTimeSchema.nullable(),
  stoppedAt: isoDateTimeSchema.nullable(),
  /** 录制在媒体服务器侧执行，前端只拿短期凭证（3.7D） */
  storageRef: z.string().max(512).nullable(),
});

export const roomParticipantSchema = z.object({
  participantId: idSchema,
  /** 展示名（已脱敏） */
  displayName: z.string().min(1).max(64),
  orgId: idSchema,
  role: roomRoleSchema,
  presence: roomPresenceSchema,
  micMuted: z.boolean(),
  cameraOn: z.boolean(),
  joinedAt: isoDateTimeSchema.nullable(),
  leftAt: isoDateTimeSchema.nullable(),
});

export const roomSchema = z.object({
  id: idSchema,
  roomNo: z.string().min(1).max(32),
  consultationId: idSchema,
  orgId: idSchema,
  status: roomStatusSchema,
  /** F2 验收：单场支持 ≥5 方 */
  maxParticipants: z.number().int().min(2).max(50),
  participants: z.array(roomParticipantSchema),
  recording: recordingStateSchema,
  createdAt: isoDateTimeSchema,
  openedAt: isoDateTimeSchema.nullable(),
  closedAt: isoDateTimeSchema.nullable(),
});

/** 入会凭证请求：厂商 secret 不下发前端，由后端 adapter 签发（3.8.5） */
export const issueRtcTokenSchema = z.object({
  participantId: idSchema,
  role: roomRoleSchema,
  /** 默认 30 分钟，上限 4 小时（3.8.4B2 TTL 同口径） */
  ttlSeconds: z.number().int().min(60).max(14400).default(1800),
});

export const rtcTokenSchema = z.object({
  roomId: idSchema,
  participantId: idSchema,
  token: z.string().min(1),
  expiresAt: isoDateTimeSchema,
});
