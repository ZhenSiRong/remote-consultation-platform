import { z } from 'zod';
import {
  annotationEventSchema,
  annotationGeometrySchema,
  annotationSchema,
  colEventSchema,
  colEventTypeSchema,
  opinionEventSchema,
  participantControlActionSchema,
  participantControlSchema,
  speechEventSchema,
  systemEventSchema,
} from '../schemas/col';

/**
 * 多方协同域实体类型（由 schemas/col 派生）
 * 时序事件是判别联合：按 `type` 收窄后即可拿到对应 payload。
 */

export type ColEvent = z.infer<typeof colEventSchema>;
export type ColEventType = z.infer<typeof colEventTypeSchema>;
export type SpeechEvent = z.infer<typeof speechEventSchema>;
export type AnnotationEvent = z.infer<typeof annotationEventSchema>;
export type OpinionEvent = z.infer<typeof opinionEventSchema>;
export type SystemEvent = z.infer<typeof systemEventSchema>;

export type Annotation = z.infer<typeof annotationSchema>;
export type AnnotationGeometry = z.infer<typeof annotationGeometrySchema>;

export type ParticipantControlAction = z.infer<typeof participantControlActionSchema>;
export type ParticipantControl = z.infer<typeof participantControlSchema>;
