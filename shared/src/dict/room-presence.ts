/**
 * 会场运行态字典 + 会场角色字典
 * 依据：架构决策.md 3.3D（会场运行态，独立字典，不属于工单状态机）、US-COL-01（角色与发言权）
 */

export const ROOM_PRESENCE_STATES = [
  'ONLINE',
  'BUSY',
  'INVITING',
  'RECONNECTING',
  'LEFT',
] as const;

export type RoomPresenceState = (typeof ROOM_PRESENCE_STATES)[number];

export interface RoomPresenceMeta {
  readonly code: RoomPresenceState;
  readonly label: string;
  readonly token: string;
  readonly animated: boolean;
}

export const ROOM_PRESENCE_META: Readonly<Record<RoomPresenceState, RoomPresenceMeta>> = {
  ONLINE: { code: 'ONLINE', label: '在线', token: '--status-active', animated: false },
  BUSY: { code: 'BUSY', label: '忙线', token: '--status-warning', animated: false },
  INVITING: { code: 'INVITING', label: '邀请中/未响应', token: '--status-neutral', animated: false },
  RECONNECTING: { code: 'RECONNECTING', label: '断线重连中', token: '--status-warning', animated: true },
  LEFT: { code: 'LEFT', label: '已离会', token: '--status-neutral', animated: false },
};

export const ROOM_PRESENCE_LIST: readonly RoomPresenceMeta[] = ROOM_PRESENCE_STATES.map(
  (code) => ROOM_PRESENCE_META[code],
);

/** 会场内角色（US-COL-01：主持人可静音/解静音、指定发言人、移出会场） */
export const ROOM_ROLES = ['HOST', 'PRESENTER', 'ATTENDEE', 'OBSERVER'] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];

export interface RoomRoleMeta {
  readonly code: RoomRole;
  readonly label: string;
  readonly canControl: boolean;
}

export const ROOM_ROLE_META: Readonly<Record<RoomRole, RoomRoleMeta>> = {
  HOST: { code: 'HOST', label: '主持人', canControl: true },
  PRESENTER: { code: 'PRESENTER', label: '发言人', canControl: false },
  ATTENDEE: { code: 'ATTENDEE', label: '参会者', canControl: false },
  OBSERVER: { code: 'OBSERVER', label: '观察者（只读）', canControl: false },
};
