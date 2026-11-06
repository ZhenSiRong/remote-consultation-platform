import { ROOM_ROLE_META, ROOM_ROLES } from '@rcp/shared'
import type { RoomParticipant, RoomPresenceState, RoomRole, RoomStatus } from '@rcp/shared'

/**
 * 会场领域元数据（展示规则层）。
 *
 * 红线：本文件**不定义第二份字典**。
 * 在线态的中文名/颜色 token、角色的中文名/是否可控制，全部原样转出 `@rcp/shared` 的
 * `ROOM_PRESENCE_META` / `ROOM_ROLE_META`。这里只补契约里没有、但页面反复要用的
 * 「派生计算」：排序权重、排序函数、时长格式化、状态中文。
 *
 * 一旦在这里另抄一份 label 或另写一条「谁是主持人」的判断，
 * 就会和 shared 里的字典漂移——改一处忘一处，演示时角色标签对不上。
 */

export { ROOM_PRESENCE_META, ROOM_PRESENCE_LIST, ROOM_ROLE_META } from '@rcp/shared'
export type { RoomPresenceState, RoomRole } from '@rcp/shared'

/**
 * 在线态排序权重：越小越靠前。
 *
 * 为什么不用 `ROOM_PRESENCE_STATES` 的下标：契约里那个数组是「字典声明顺序」，
 * 它把 INVITING 排在 RECONNECTING 前面；但对会场成员列表来说，
 * **断线重连中的人还在会场里**（只是链路抖动，画面随时会回来），
 * 而邀请中的人根本没进来。让重连中的人排在邀请中之前，才符合主持人扫一眼的直觉。
 *
 * 写成 Record 而不是 switch：新增在线态时 TS 会直接编译报错，不会静默落到默认分支。
 */
const PRESENCE_WEIGHT: Readonly<Record<RoomPresenceState, number>> = {
  ONLINE: 0,
  BUSY: 1,
  RECONNECTING: 2,
  INVITING: 3,
  LEFT: 9,
}

/** 在线态 → 排序权重（在线的人排前面，离会的排最后） */
export function presenceWeight(state: RoomPresenceState): number {
  return PRESENCE_WEIGHT[state]
}

/**
 * 会场角色 → 排序权重（主持人永远第一）。
 * 直接取 `ROOM_ROLES` 的下标：契约里角色数组就是按权限从高到低声明的，
 * 用它当下标等于复用契约顺序，不另立一套角色优先级。
 */
export function roleWeight(role: RoomRole): number {
  const index = ROOM_ROLES.indexOf(role)
  // indexOf 理论上不会 -1（入参类型已收窄），兜底成「最后」而不是「最前」，避免误判成主持人
  return index >= 0 ? index : ROOM_ROLES.length
}

/** 当前角色能否控制别人（只读 ROOM_ROLE_META.canControl，不另写规则） */
export function canControlOthers(role: RoomRole): boolean {
  return ROOM_ROLE_META[role].canControl
}

/** 入会时间 → 时间戳；未入会（null）排到最后 */
function joinedTimestamp(participant: RoomParticipant): number {
  if (!participant.joinedAt) {
    return Number.POSITIVE_INFINITY
  }
  const value = Date.parse(participant.joinedAt)
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
}

/**
 * 参会方排序：角色优先，其次在线态，最后 joinedAt 早的在前。
 * 返回新数组（不原地 sort）：调用方常常直接绑到 computed 上，
 * 原地改会污染接口返回的对象，轮询时出现「顺序自己变了」的怪现象。
 */
export function sortParticipants(participants: RoomParticipant[]): RoomParticipant[] {
  return [...participants].sort((a, b) => {
    const byRole = roleWeight(a.role) - roleWeight(b.role)
    if (byRole !== 0) {
      return byRole
    }
    const byPresence = presenceWeight(a.presence) - presenceWeight(b.presence)
    if (byPresence !== 0) {
      return byPresence
    }
    const byJoined = joinedTimestamp(a) - joinedTimestamp(b)
    if (byJoined !== 0) {
      return byJoined
    }
    // 最后按 id 兜底：两人角色、状态、入会时间全相同时顺序也必须稳定，否则列表每帧抖动
    return a.participantId.localeCompare(b.participantId)
  })
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 会场时长：'12:34' / '1:02:03'。
 * now 可注入，方便页面用一个共享的 tick 时间源算时长，避免每个成员卡片各取一次 new Date()
 * 导致同一屏里出现两个不同的秒数。
 */
export function formatRoomDuration(startedAt: string | null, now: Date = new Date()): string {
  if (!startedAt) {
    return '00:00'
  }
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) {
    return '00:00'
  }

  // 负数（客户端时钟比服务端快）按 0 处理，不显示 '-00:03' 这种吓人的时长
  const totalSeconds = Math.max(0, Math.floor((now.getTime() - start) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(seconds)}`
    : `${pad2(minutes)}:${pad2(seconds)}`
}

/** 会场状态 → 中文（CREATED 未开始 / OPEN 进行中 / CLOSED 已结束） */
export function roomStatusLabel(status: RoomStatus): string {
  const labels: Readonly<Record<RoomStatus, string>> = {
    CREATED: '未开始',
    OPEN: '进行中',
    CLOSED: '已结束',
  }
  return labels[status]
}
