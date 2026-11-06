import { ERROR_CODES, ROOM_ROLE_META, ROOM_ROLES, roomSchema } from '@rcp/shared'
import type { Room, RoomParticipant, RoomRole } from '@rcp/shared'
import type { MockContext, MockReply, MockRoute } from './adapter'
import { SELF_ORG_ID } from './fixtures'

/**
 * 会诊室（音视频会场）mock 接口 —— 7 个 handler。
 *
 * 三条红线：
 * 1. **每个出口都过 `roomSchema.parse()`**。会场是页面轮询的高频对象，字段形状一旦和契约
 *    差一个（比如漏了 leftAt），页面不会报错、只会静默渲染出空白。让它在 mock 层当场炸，
 *    问题暴露在写 mock 的这一刻，而不是接真后端的那一天。
 * 2. **控制权限只认 `ROOM_ROLE_META.canControl`**，不在这里另写 `role === 'HOST'`。
 *    字典是唯一事实源，将来若新增「联席主持人」，改 shared 即可，这里自动跟上。
 * 3. **状态变化必须写进 room 对象本身**，不能只发事件。页面靠轮询 GET 拿最新态，
 *    只发事件的话，事件到达时页面手里的 room 还是旧的，UI 会「事件响了但颜色没变」。
 *
 * 内存数据刷新即重置，与 consult mock 同口径：本期不做持久化。
 */

/** F2 验收：单场支持 ≥5 方。种子 4 人（含 1 位未入会），因此第 6 人入会必然超限 */
const MAX_PARTICIPANTS = 5

/**
 * 当前登录用户在会场里的固定 id。
 * 会前检测页与会诊室页面都写死这个常量当 selfId，mock 种子的主持人也用它——
 * 三处必须是同一个值，否则 join 会在种子之外追加一个新主持人（侧栏出现两个「主持人」）。
 * 接真登录态后改成从会话取，这里只是演示期的替代。
 */
export const HOST_PARTICIPANT_ID = 'host-local'

/** 会场角色白名单：直接用契约数组，避免手抄字符串 */
function isRoomRole(value: unknown): value is RoomRole {
  return typeof value === 'string' && (ROOM_ROLES as readonly string[]).includes(value)
}

const CONTROL_ACTIONS = ['MUTE', 'UNMUTE', 'REMOVE'] as const
type ControlAction = (typeof CONTROL_ACTIONS)[number]

function isControlAction(value: unknown): value is ControlAction {
  return typeof value === 'string' && (CONTROL_ACTIONS as readonly string[]).includes(value)
}

interface RoomEntry {
  room: Room
  /**
   * `GET /consultations/:id/room` 被调用过几次。
   * 按会诊单独立计数（不是全局计数）：演示时可能先看过别的会诊单的会场，
   * 全局计数会让「第 3 次」落在别人身上，录屏脚本就对不上了。
   */
  pollCount: number
}

/** 会场内存表：key = 会诊单 id。同一张会诊单只允许有一个会场 */
const rooms = new Map<string, RoomEntry>()

/** 会场序号游标：roomNo 用 ROOM2026xxxx，与工单号 HZ2026xxxx 保持同一种可读形态 */
let nextRoomSeq = 1

function pad4(value: number): string {
  return String(value).padStart(4, '0')
}

/**
 * 当前时间 → ISO 8601 带 +08:00。
 * 不用 toISOString() 直接返回：契约样例是 `+08:00`，混进 `Z` 后缀会让页面的时间格式化多一套分支。
 */
function nowIso(): string {
  const beijing = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return beijing.toISOString().replace('Z', '+08:00')
}

/** 取路径第 index 段：'/consultations/:id/room' 与 '/rooms/:id/join' 的 id 都在第 2 段 */
function segment(path: string, index: number): string {
  return decodeURIComponent(path.split('/')[index] ?? '')
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function ok(data: unknown): MockReply {
  return { code: ERROR_CODES.SUCCESS, message: 'ok', data }
}

function fail(code: number, message: string): MockReply {
  return { code, message, data: null }
}

/* ------------------------------------------------------------------ *
 * 演示事件总线
 * ------------------------------------------------------------------ */

/** mock 会场能派发的三类事件（页面按需订阅，真实接入后换成 RTC 归一事件） */
export const ROOM_MOCK_EVENTS = ['peer.reconnecting', 'peer.restored', 'recording.tick'] as const

export type RoomMockEventName = (typeof ROOM_MOCK_EVENTS)[number]

/**
 * 事件载荷。字段全部可空而不是拆成三个 interface：
 * 页面订阅时通常是一个统一 handler，拆类型只会逼着它写三份断言。
 */
export interface RoomMockEventDetail {
  roomId: string
  /** 与事件相关的参会方；recording.tick 不针对某个人，为 null */
  participantId: string | null
  displayName: string | null
  /** 录制已进行秒数，仅 recording.tick 有值 */
  elapsedSeconds: number | null
}

/**
 * 会场事件总线。
 *
 * 为什么用 EventTarget 而不是 Pinia 或回调注册表：
 * mock 层不该依赖 store（store 是视图状态，mock 是"假后端"），
 * EventTarget 是平台自带能力，页面 `addEventListener` / `removeEventListener` 即可，
 * 换真 SDK 时把订阅目标从 bus 换成 RTC 客户端，页面逻辑形状不变。
 */
export const roomEventBus = new EventTarget()

function emit(name: RoomMockEventName, detail: RoomMockEventDetail): void {
  roomEventBus.dispatchEvent(new CustomEvent<RoomMockEventDetail>(name, { detail }))
}

function eventDetail(
  room: Room,
  participant: RoomParticipant | null = null,
  elapsedSeconds: number | null = null,
): RoomMockEventDetail {
  return {
    roomId: room.id,
    participantId: participant?.participantId ?? null,
    displayName: participant?.displayName ?? null,
    elapsedSeconds,
  }
}

/** 录制已进行秒数；未开始返回 null（页面据此不启动计时器） */
function recordingElapsedSeconds(room: Room): number | null {
  const startedAt = room.recording.startedAt
  if (!startedAt) {
    return null
  }
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) {
    return null
  }
  return Math.max(0, Math.floor((Date.now() - start) / 1000))
}

/* ------------------------------------------------------------------ *
 * 会场种子
 * ------------------------------------------------------------------ */

/**
 * 种子参会方 4 人。displayName 全部是**后端已脱敏**形态（保留姓氏，其余打码），
 * 前端只展示不还原（A-06）。
 *
 * 分布是刻意为演示设计的：
 * - 主持人（本院发起医生）：全开，负责演示静音/移出别人；
 * - 发言人（受邀专家）：负责演示「断线重连中」的黄色呼吸态；
 * - 记录员：默认静音且关摄像头，演示「只闻其声」的成员卡片；
 * - 观察者：INVITING，演示「邀请中/未响应」，也解释了为什么上限 5 人却只有 3 个画面。
 */
function seedParticipants(roomId: string, joinedAt: string): RoomParticipant[] {
  return [
    {
      // 固定 id，不用 `${roomId}-host`：页面侧用常量 `host-local` 标识当前登录用户，
      // 两边不一致会导致 join 时在种子 4 人之外**追加**一个主持人（5 人、两个「主持人」）。
      // 用固定 id 后 join 变成幂等更新，符合真实系统「同一个人重进会场不会多出一行」的语义。
      participantId: HOST_PARTICIPANT_ID,
      displayName: '王**',
      orgId: SELF_ORG_ID,
      role: 'HOST',
      presence: 'ONLINE',
      micMuted: false,
      cameraOn: true,
      joinedAt,
      leftAt: null,
    },
    {
      participantId: `${roomId}-presenter`,
      displayName: '陈**',
      orgId: 'org-2001',
      role: 'PRESENTER',
      presence: 'ONLINE',
      micMuted: false,
      cameraOn: true,
      joinedAt,
      leftAt: null,
    },
    {
      participantId: `${roomId}-attendee`,
      displayName: '赵**',
      orgId: SELF_ORG_ID,
      role: 'ATTENDEE',
      presence: 'ONLINE',
      micMuted: true,
      cameraOn: false,
      joinedAt,
      leftAt: null,
    },
    {
      participantId: `${roomId}-observer`,
      displayName: '孙**',
      orgId: 'org-2003',
      role: 'OBSERVER',
      presence: 'INVITING',
      micMuted: true,
      cameraOn: false,
      // 未入会的人没有入会时间：joinedAt 为 null 是「邀请中」在数据上的唯一区分点
      joinedAt: null,
      leftAt: null,
    },
  ]
}

/** 懒创建会场：首次访问某张会诊单的会场时才建，避免种子阶段就铺一堆空会场 */
function createRoom(consultationId: string): RoomEntry {
  const seq = nextRoomSeq
  nextRoomSeq += 1

  const now = nowIso()
  const roomId = `room-${pad4(seq)}`

  const room: Room = {
    id: roomId,
    roomNo: `ROOM2026${pad4(seq)}`,
    consultationId,
    orgId: SELF_ORG_ID,
    // 建好但不算开始：主持人真正入会（join）时才转 OPEN 并写 openedAt
    status: 'CREATED',
    maxParticipants: MAX_PARTICIPANTS,
    participants: seedParticipants(roomId, now),
    recording: {
      status: 'IDLE',
      recordingId: null,
      startedAt: null,
      stoppedAt: null,
      storageRef: null,
    },
    createdAt: now,
    openedAt: null,
    closedAt: null,
  }

  // 种子当场过契约：写错一个字段现在炸，比演示时白屏好
  return { room: roomSchema.parse(room), pollCount: 0 }
}

function findEntryByConsultation(consultationId: string): RoomEntry {
  const existing = rooms.get(consultationId)
  if (existing) {
    return existing
  }
  const created = createRoom(consultationId)
  rooms.set(consultationId, created)
  return created
}

/** 按会场 id 反查：写操作路径里带的是 roomId，不是会诊单 id */
function findRoomById(roomId: string): Room | null {
  for (const entry of rooms.values()) {
    if (entry.room.id === roomId) {
      return entry.room
    }
  }
  return null
}

/** 会场人数：离会的人不占名额，否则「移出一个人」腾不出位置，演示会很别扭 */
function activeCount(room: Room): number {
  return room.participants.filter((item) => item.presence !== 'LEFT').length
}

/* ------------------------------------------------------------------ *
 * 断线重连节奏
 * ------------------------------------------------------------------ */

/** 第几次轮询让发言人转「断线重连中」 */
const RECONNECT_AT_POLL = 3
/** 第几次轮询让发言人恢复「在线」 */
const RESTORE_AT_POLL = 5

/**
 * 按轮询次数制造一次「断线 → 恢复」。
 *
 * 为什么不做真断网：演示环境网络本来就不可控，真断网时页面可能连轮询都发不出去，
 * 黄色呼吸态根本渲染不出来。这里只在数据上翻一次 presence，页面的渲染分支与真断网完全一致。
 * 用「等于」而不是「大于等于」：越过这个次数后不再反复翻转，否则录屏时状态会来回跳。
 */
function applyPresenceRhythm(entry: RoomEntry): void {
  const presenter = entry.room.participants.find((item) => item.role === 'PRESENTER')
  // 已被主持人移出会场的人不再参与演练，否则会出现「已离会」又「重连中」的矛盾态
  if (!presenter || presenter.presence === 'LEFT') {
    return
  }

  if (entry.pollCount === RECONNECT_AT_POLL && presenter.presence === 'ONLINE') {
    presenter.presence = 'RECONNECTING'
    emit('peer.reconnecting', eventDetail(entry.room, presenter))
    return
  }

  if (entry.pollCount === RESTORE_AT_POLL && presenter.presence === 'RECONNECTING') {
    presenter.presence = 'ONLINE'
    emit('peer.restored', eventDetail(entry.room, presenter))
  }
}

/* ------------------------------------------------------------------ *
 * handlers
 * ------------------------------------------------------------------ */

function handleFetchRoom(ctx: MockContext): MockReply {
  const consultationId = segment(ctx.path, 2)
  if (!consultationId) {
    return fail(ERROR_CODES.PARAM_INVALID, '缺少会诊单标识')
  }

  const entry = findEntryByConsultation(consultationId)
  entry.pollCount += 1
  applyPresenceRhythm(entry)

  // 录制中每次轮询都发一次 tick：页面用同一个时间源刷新时长，不必自己 setInterval 猜
  if (entry.room.recording.status === 'RECORDING') {
    emit('recording.tick', eventDetail(entry.room, null, recordingElapsedSeconds(entry.room)))
  }

  return ok(roomSchema.parse(entry.room))
}

/**
 * 临时入会者的脱敏展示名。
 * 真后端按会话里的医师档案取名，mock 没有档案，用池子轮转；
 * 保持 `姓**` 形态是为了让「前端只展示脱敏名」这条规则在 mock 阶段就被验证到。
 */
const GUEST_NAMES = ['周**', '吴**', '郑**', '冯**', '何**'] as const

function handleJoin(ctx: MockContext): MockReply {
  const room = findRoomById(segment(ctx.path, 2))
  if (!room) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '资源不存在')
  }

  const body = asRecord(ctx.body)
  const participantId = readString(body.participantId)
  const role = body.role
  if (!participantId) {
    return fail(ERROR_CODES.PARAM_INVALID, '缺少参会方标识')
  }
  if (!isRoomRole(role)) {
    return fail(ERROR_CODES.PARAM_INVALID, '未知的会场角色')
  }
  if (room.status === 'CLOSED') {
    // 会场已结束属于音视频域失败（5xxxx），页面按「降级提示 + 重试」处理，不阻塞工单
    return fail(ERROR_CODES.ROOM_CREATE_FAILED, '会场已结束，无法加入')
  }

  const now = nowIso()
  const existing = room.participants.find((item) => item.participantId === participantId)
  // 新入会、或曾经离会又重新进来的人，都会占用一个名额
  const willBeActive = !existing || existing.presence === 'LEFT'

  if (willBeActive && activeCount(room) >= room.maxParticipants) {
    return fail(
      ERROR_CODES.PARTICIPANT_LIMIT_EXCEEDED,
      `会场人数已达上限（${room.maxParticipants} 人），请移除参会方或改用旁听`,
    )
  }

  if (existing) {
    // 重新入会沿用原角色：角色由主持人授予，不能因为客户端在 join 时传了 HOST 就提权
    if (existing.presence === 'LEFT') {
      existing.presence = 'ONLINE'
      existing.leftAt = null
      existing.joinedAt = existing.joinedAt ?? now
    }
  } else {
    room.participants.push({
      participantId,
      displayName: GUEST_NAMES[room.participants.length % GUEST_NAMES.length],
      orgId: SELF_ORG_ID,
      role,
      presence: 'ONLINE',
      micMuted: false,
      cameraOn: true,
      joinedAt: now,
      leftAt: null,
    })
  }

  if (room.status === 'CREATED') {
    room.status = 'OPEN'
    room.openedAt = now
  }

  return ok(roomSchema.parse(room))
}

function handleLeave(ctx: MockContext): MockReply {
  const room = findRoomById(segment(ctx.path, 2))
  if (!room) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '资源不存在')
  }

  const participantId = readString(asRecord(ctx.body).participantId)
  const target = room.participants.find((item) => item.participantId === participantId)
  if (!target) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '该参会方不在本会场')
  }

  const now = nowIso()
  target.presence = 'LEFT'
  target.leftAt = now

  // 全员离会 = 会场结束。同时把还在跑的录制停掉，
  // 否则会出现「会场已结束但录制中」这种契约上说不通、演示时会被问住的组合态。
  if (room.participants.every((item) => item.presence === 'LEFT')) {
    room.status = 'CLOSED'
    room.closedAt = now
    if (room.recording.status === 'RECORDING') {
      room.recording.status = 'STOPPED'
      room.recording.stoppedAt = now
    }
  }

  return ok(roomSchema.parse(room))
}

function handleMedia(ctx: MockContext): MockReply {
  const room = findRoomById(segment(ctx.path, 2))
  if (!room) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '资源不存在')
  }

  const body = asRecord(ctx.body)
  const participantId = readString(body.participantId)
  const target = room.participants.find((item) => item.participantId === participantId)
  if (!target) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '该参会方不在本会场')
  }

  // 只认布尔值：页面把未改动的开关传成 undefined 时保持原值，不会被覆盖回 false
  if (typeof body.micMuted === 'boolean') {
    target.micMuted = body.micMuted
  }
  if (typeof body.cameraOn === 'boolean') {
    target.cameraOn = body.cameraOn
  }

  return ok(roomSchema.parse(room))
}

function handleControl(ctx: MockContext): MockReply {
  const room = findRoomById(segment(ctx.path, 2))
  if (!room) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '资源不存在')
  }

  const body = asRecord(ctx.body)
  const targetId = readString(body.targetId)
  const action = body.action
  if (!targetId) {
    return fail(ERROR_CODES.PARAM_INVALID, '缺少被控参会方标识')
  }
  if (!isControlAction(action)) {
    return fail(ERROR_CODES.PARAM_INVALID, '未知的会场控制动作')
  }

  /**
   * 操作人：真后端从会话里取当前登录用户，mock 没有会话，默认视为主持人。
   * 额外允许 body.actorId 指定，只为让「非主持人调用 → 10003」这条分支在演示/验收时可复现，
   * 页面不需要传它（api 签名里也没有这个参数）。
   */
  const host = room.participants.find((item) => item.role === 'HOST')
  const actorId = readString(body.actorId) || host?.participantId || ''
  const actor = room.participants.find((item) => item.participantId === actorId)

  // 权限判断只读字典的 canControl：当前只有 HOST 为 true，但规则不写死在这里
  if (!actor || !ROOM_ROLE_META[actor.role].canControl) {
    return fail(ERROR_CODES.FORBIDDEN, '仅主持人可执行会场控制')
  }
  if (targetId === actor.participantId) {
    return fail(ERROR_CODES.PARAM_INVALID, '不能对自己执行该操作')
  }

  const target = room.participants.find((item) => item.participantId === targetId)
  if (!target) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '该参会方不在本会场')
  }

  switch (action) {
    case 'MUTE':
      target.micMuted = true
      break
    case 'UNMUTE':
      target.micMuted = false
      break
    case 'REMOVE':
      target.presence = 'LEFT'
      target.leftAt = nowIso()
      break
  }

  return ok(roomSchema.parse(room))
}

function handleRecordingStart(ctx: MockContext): MockReply {
  const room = findRoomById(segment(ctx.path, 2))
  if (!room) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '资源不存在')
  }

  // 重复点击不报错：录制态已经是 RECORDING 时直接回当前态，页面不会弹无意义的失败提示
  if (room.recording.status === 'RECORDING') {
    return ok(roomSchema.parse(room))
  }

  // R13：没有任何人推流时录制必然拿到空文件，必须先拦住
  const hasStream = room.participants.some(
    (item) => item.presence !== 'LEFT' && item.cameraOn,
  )
  if (!hasStream) {
    return fail(ERROR_CODES.RECORDING_START_FAILED, '当前无可用视频流，无法启动录制')
  }

  const now = nowIso()
  const recordingId = `rec-${room.id}-${Date.now()}`
  room.recording = {
    status: 'RECORDING',
    recordingId,
    startedAt: now,
    stoppedAt: null,
    // 录制在媒体服务器侧执行，前端只拿短期凭证（3.7D），mock 给一个可读的假引用
    storageRef: `mock://recordings/${room.id}/${recordingId}`,
  }

  emit('recording.tick', eventDetail(room, null, 0))
  return ok(roomSchema.parse(room))
}

function handleRecordingStop(ctx: MockContext): MockReply {
  const room = findRoomById(segment(ctx.path, 2))
  if (!room) {
    return fail(ERROR_CODES.RESOURCE_NOT_FOUND, '资源不存在')
  }

  // 幂等：没在录的时候点停止不算错，保留最后一次的 recordingId 便于对账
  if (room.recording.status !== 'RECORDING') {
    return ok(roomSchema.parse(room))
  }

  room.recording.status = 'STOPPED'
  room.recording.stoppedAt = nowIso()

  return ok(roomSchema.parse(room))
}

/**
 * 路由表。
 * 会场的 6 个写操作都是 POST + 子路径，形状与 consultRoutes 一致：
 * 路径里带的是 roomId（会场自己的标识），只有「按会诊单取会场」走 consultations 前缀。
 */
export const roomRoutes: MockRoute[] = [
  { method: 'GET', pattern: '/consultations/:id/room', handler: handleFetchRoom },
  { method: 'POST', pattern: '/rooms/:id/join', handler: handleJoin },
  { method: 'POST', pattern: '/rooms/:id/leave', handler: handleLeave },
  { method: 'POST', pattern: '/rooms/:id/media', handler: handleMedia },
  { method: 'POST', pattern: '/rooms/:id/control', handler: handleControl },
  { method: 'POST', pattern: '/rooms/:id/recording/start', handler: handleRecordingStart },
  { method: 'POST', pattern: '/rooms/:id/recording/stop', handler: handleRecordingStop },
]
