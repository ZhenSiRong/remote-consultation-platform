import { z } from 'zod';
import { ROLES } from '../authz/permissions';
import { idSchema, isoDateTimeSchema } from './common';

/**
 * 多方协同域（col）—— US-COL-01·02 / US-REC-06（统一时间轴）/ 3.8.5 规则 5（回调归一为内部事件）
 *
 * 语音转写片段、标注帧、文字意见共用**一条时间轴**，时间戳由服务端统一授时（3.7C），
 * 前端只提交相对序号 + 本地时刻，`serverTs` 由后端归一。
 */

export const COL_EVENT_TYPES = ['SPEECH', 'ANNOTATION', 'OPINION', 'SYSTEM'] as const;
export const colEventTypeSchema = z.enum(COL_EVENT_TYPES);

export const COL_SYSTEM_EVENTS = [
  'CONSULT_STARTED',
  'CONSULT_ENDED',
  'PERM_CHANGE',
  'PARTICIPANT_JOINED',
  'PARTICIPANT_LEFT',
  'RECORDING_STARTED',
  'RECORDING_STOPPED',
  'CONNECTION_LOST',
  'CONNECTION_RESTORED',
] as const;
export const colSystemEventSchema = z.enum(COL_SYSTEM_EVENTS);

export const annotationGeometrySchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

/** 协同标注：实时同步、带作者与时间戳、支持显隐与导出标注层（US-COL-02） */
export const annotationSchema = z.object({
  id: idSchema,
  consultationId: idSchema,
  /** 标注目标（序列/帧的稳定引用，不含厂商专有 ID） */
  targetRef: z.string().min(1).max(128),
  frameIndex: z.number().int().min(0).nullable(),
  geometry: annotationGeometrySchema,
  text: z.string().max(500),
  authorId: idSchema,
  authorRole: z.enum(ROLES),
  visible: z.boolean(),
  createdAt: isoDateTimeSchema,
});

const colEventBase = {
  id: idSchema,
  consultationId: idSchema,
  /** 单调递增序号，服务端授时后归一（3.7C） */
  seq: z.number().int().min(0),
  serverTs: isoDateTimeSchema,
  actorId: idSchema,
  actorRole: z.enum(ROLES),
};

export const speechEventSchema = z.object({
  ...colEventBase,
  type: z.literal('SPEECH'),
  transcript: z.string().max(5000),
  audioRef: z.string().max(512).nullable(),
  durationMs: z.number().int().min(0),
});

export const annotationEventSchema = z.object({
  ...colEventBase,
  type: z.literal('ANNOTATION'),
  annotation: annotationSchema,
});

export const opinionEventSchema = z.object({
  ...colEventBase,
  type: z.literal('OPINION'),
  opinionId: idSchema,
  summary: z.string().max(500),
});

export const systemEventSchema = z.object({
  ...colEventBase,
  type: z.literal('SYSTEM'),
  name: colSystemEventSchema,
  detail: z.string().max(500).nullable(),
});

/** 时序事件：一条时间轴上的四类节点 */
export const colEventSchema = z.discriminatedUnion('type', [
  speechEventSchema,
  annotationEventSchema,
  opinionEventSchema,
  systemEventSchema,
]);

/** 会场权限控制（US-COL-01）：变更实时生效并留痕 PERM_CHANGE */
export const PARTICIPANT_CONTROL_ACTIONS = [
  'MUTE',
  'UNMUTE',
  'ASSIGN_SPEAKER',
  'REMOVE',
] as const;
export const participantControlActionSchema = z.enum(PARTICIPANT_CONTROL_ACTIONS);

export const participantControlSchema = z.object({
  participantId: idSchema,
  action: participantControlActionSchema,
  reason: z.string().max(200).optional(),
});
