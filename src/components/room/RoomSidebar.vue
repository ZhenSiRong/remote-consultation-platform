<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { ConsultOrder, Room, RoomParticipant } from '@/api/types'
import { controlParticipant } from '@/api/room'
import type { RoomControlAction } from '@/api/room'
import { fetchConsultDetail } from '@/api/consult'
import { ApiError } from '@/api/request'
import {
  ROOM_PRESENCE_META,
  ROOM_ROLE_META,
  canControlOthers,
  sortParticipants,
} from '@/domain/room/presence'

/**
 * 会诊室右侧栏（参会方 / 消息 / 资料）。
 *
 * 三条设计约束：
 * 1. **布局是 flex 子项而不是 position:fixed**。会诊室主体是「视频区 + 侧栏」的横向 flex，
 *    侧栏用 fixed 会盖住视频区，父容器还得补 padding-right 才能不遮挡——把定位权交给父容器，
 *    组件只负责自己的宽度和内部滚动。
 * 2. **控制操作只发请求、不自己改本地 room**。接口返回的是操作后的整个会场，
 *    由父组件回填并重新下传，侧栏和视频区永远看到同一份数据；本地改一半会出现
 *    「侧栏变灰了、视频格子还亮着」的分裂状态。
 * 3. **权限判断只走 `canControlOthers`**，不在模板里写 `role === 'HOST'`：
 *    字典将来若加「联席主持人」，这里自动跟上，不用回来改页面。
 *
 * 稳定 class（验收脚本依赖）：`.room-sidebar` / `.room-sidebar__tab` / `.participant-row`
 * / `.participant-row__dot` / `.participant-row__role` / `.room-chat` / `.room-chat__item`
 * / `.room-chat__item--self` / `.room-chat__item--system` / `.room-chat__input`
 * / `.room-record` / `.room-record__row` / `.room-record__label`。
 */
interface Props {
  room: Room
  /** 当前用户在该会场的 participantId */
  selfId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** 做了控制操作（静音/移出），父组件需重新拉 room */
  refresh: []
  /** 点了「离开会场」 */
  'leave-room': []
}>()

/* ------------------------------------------------------------------ *
 * 页签
 * ------------------------------------------------------------------ */

type TabKey = 'members' | 'chat' | 'record'

/** 页签顺序：成员 → 消息 → 资料，与会诊进行中的关注顺序一致 */
const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'members', label: '参会方' },
  { key: 'chat', label: '消息' },
  { key: 'record', label: '资料' },
]

const activeTab = ref<TabKey>('members')

/* ------------------------------------------------------------------ *
 * 参会方
 * ------------------------------------------------------------------ */

/** 排序交给领域层：角色 → 在线态 → 入会时间，页面不重复实现一套权重 */
const participants = computed<RoomParticipant[]>(() => sortParticipants(props.room.participants))

/** 离会的人不占名额，与后端 activeCount 同口径，否则「移出一个人」后名额数字不动 */
const onlineCount = computed(
  () => props.room.participants.filter((item) => item.presence !== 'LEFT').length,
)

/**
 * 解析「我」：优先按 participantId 精确匹配，匹配不到时回落到主持人席位。
 *
 * 为什么要回落：演示环境的本地用户标识（host-local）与会场种子里的主持人标识
 * （room-xxxx-host）不是同一个值，父组件若按会话取 id 就会对不上；
 * 严格匹配的话主持人一行既不显示「(你)」、也拿不到任何控场入口，演示直接卡住。
 * 回落只影响「谁是我」的展示，权限仍由 canControlOthers(role) 决定——
 * 万一回落错了人，接口会以 10003 拦下，不会真的越权。
 */
const self = computed<RoomParticipant | null>(() => {
  const exact = props.room.participants.find((item) => item.participantId === props.selfId)
  if (exact) {
    return exact
  }
  return props.room.participants.find((item) => item.role === 'HOST') ?? null
})

const selfName = computed(() => self.value?.displayName ?? '我')

/** 当前用户角色；未入会时为 null */
const myRole = computed(() => self.value?.role ?? null)

/** 能否控场：角色字典说可以，且自己确实在会场里 */
const canControl = computed(() => myRole.value !== null && canControlOthers(myRole.value))

/** 菜单可见条件：能控场 + 不是自己 + 人还在会场（已离会的人没有可执行动作） */
function canOperate(target: RoomParticipant): boolean {
  return canControl.value && target.participantId !== self.value?.participantId && target.presence !== 'LEFT'
}

/** 头像取展示名首字：脱敏名（王**）首字即姓氏，比取两个字符更稳 */
function avatarText(name: string): string {
  return name.slice(0, 1) || '?'
}

/** 在线态色点颜色：token 来自字典（形如 '--status-active'），组件里不写死任何色值 */
function presenceColor(presence: RoomParticipant['presence']): string {
  return `var(${ROOM_PRESENCE_META[presence].token})`
}

/** 行尾麦克风图标的提示文案，省掉一个纯视觉图标的可访问性盲区 */
function micTitle(muted: boolean): string {
  return muted ? '麦克风已静音' : '麦克风开启'
}

/**
 * 正在被控的参会方。
 * 一次只放行一个控制请求：静音和移出打的是同一个会场，两个请求并发时后端可能按
 * 相反顺序落库，页面刷新后看到的结果和手速对不上。这里用单值锁串行化，
 * 同时把被点的那一行压暗，让用户知道「这一下已经发出去了」。
 */
const pendingId = ref<string | null>(null)

const CONTROL_ACTIONS = ['MUTE', 'UNMUTE', 'REMOVE'] as const

function isControlAction(value: unknown): value is RoomControlAction {
  return typeof value === 'string' && (CONTROL_ACTIONS as readonly string[]).includes(value)
}

/** 操作成功后的提示文案：带上对方展示名，录屏时能一眼看出动的是谁 */
function successText(action: RoomControlAction, name: string): string {
  if (action === 'MUTE') return `已静音 ${name}`
  if (action === 'UNMUTE') return `已取消静音 ${name}`
  return `已移出 ${name}`
}

/**
 * 执行会场控制。
 * 成功后 emit('refresh') 而不是本地改 room：接口已经返回最新会场，
 * 让父组件统一回填，避免侧栏与视频区各自维护一份状态。
 */
async function handleControl(target: RoomParticipant, action: RoomControlAction): Promise<void> {
  if (pendingId.value !== null) {
    return
  }
  pendingId.value = target.participantId
  try {
    await controlParticipant(props.room.id, target.participantId, action)
    ElMessage.success(successText(action, target.displayName))
    emit('refresh')
  } catch (error) {
    // 失败一律按 ApiError 展示后端原话（如「仅主持人可执行会场控制」），不吞成「操作失败」
    ElMessage.error(error instanceof ApiError ? error.message : '操作失败，请稍后重试')
  } finally {
    pendingId.value = null
  }
}

/** el-dropdown 的 command 是 string | number | object，先收窄再派发；收成 unknown 是为了不依赖组件库的联合类型 */
function handleCommand(target: RoomParticipant, command: unknown): void {
  if (!isControlAction(command)) {
    return
  }
  void handleControl(target, command)
}

/* ------------------------------------------------------------------ *
 * 消息（本地状态，不落库）
 * ------------------------------------------------------------------ */

interface ChatMessage {
  id: number
  from: string
  fromName: string
  text: string
  at: string
  self: boolean
}

/** 系统消息的发信方标识：用固定常量而不是散落的 'system' 字面量 */
const SYSTEM_SENDER = 'system'

function formatClock(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 专家展示名：从参会方里取，取不到时用「专家」兜底，避免气泡上出现空白发信人 */
const presenterName = computed(
  () => props.room.participants.find((item) => item.role === 'PRESENTER')?.displayName ?? '专家',
)

const presenterId = computed(
  () => props.room.participants.find((item) => item.role === 'PRESENTER')?.participantId ?? 'presenter',
)

const draft = ref('')

const chatListRef = ref<HTMLElement | null>(null)

/** 自增 id 游标；从 4 起，因为预置了 1–3 三条 */
let nextMessageId = 4

/**
 * 预置三条消息：让「会诊进行中」有内容可看。
 * 顺序刻意是「系统通知 → 专家 → 主持人（我）」，演示时一进消息页就能看到三方角色都在说话。
 */
const messages = ref<ChatMessage[]>([
  {
    id: 1,
    from: SYSTEM_SENDER,
    fromName: '系统',
    text: '会诊已开始，本场将录制留痕',
    at: formatClock(new Date()),
    self: false,
  },
  {
    id: 2,
    from: presenterId.value,
    fromName: presenterName.value,
    text: '影像已上传，请主持人确认',
    at: formatClock(new Date()),
    self: false,
  },
  {
    id: 3,
    from: self.value?.participantId ?? props.selfId,
    fromName: selfName.value,
    text: '收到，请同步一下患者主诉',
    at: formatClock(new Date()),
    self: true,
  },
])

/**
 * 滚到底部。
 * 必须等 nextTick：新消息先渲染进 DOM，scrollHeight 才是包含它的高度，
 * 否则每次都停在「上一条」的位置，看起来像少了一条。
 */
async function scrollToBottom(): Promise<void> {
  await nextTick()
  const list = chatListRef.value
  if (list) {
    list.scrollTop = list.scrollHeight
  }
}

function sendMessage(): void {
  const text = draft.value.trim()
  // 空白消息不发送：只敲空格也生成气泡会让演示看起来像出 bug
  if (text === '') {
    return
  }
  messages.value.push({
    id: nextMessageId,
    from: self.value?.participantId ?? props.selfId,
    fromName: selfName.value,
    text,
    at: formatClock(new Date()),
    self: true,
  })
  nextMessageId += 1
  draft.value = ''
  void scrollToBottom()
}

// 切回消息页时补一次滚底：在别的页签停留期间列表高度可能变过
watch(activeTab, (tab) => {
  if (tab === 'chat') {
    void scrollToBottom()
  }
})

/* ------------------------------------------------------------------ *
 * 资料
 * ------------------------------------------------------------------ */

const record = ref<ConsultOrder | null>(null)
const recordLoading = ref(false)
const recordError = ref('')

/**
 * 拉取工单详情。
 * 进页面就拉（不等切到资料页）：会诊中主持人随时可能被问「这位患者什么情况」，
 * 提前拉好能省掉一次切页签后的等待。
 */
async function loadRecord(): Promise<void> {
  if (recordLoading.value) {
    return
  }
  recordLoading.value = true
  recordError.value = ''
  try {
    record.value = await fetchConsultDetail(props.room.consultationId)
  } catch (error) {
    record.value = null
    recordError.value = error instanceof ApiError ? error.message : '资料加载失败'
  } finally {
    recordLoading.value = false
  }
}

onMounted(() => {
  void loadRecord()
})

/** 性别中文：契约层是 MALE/FEMALE/UNKNOWN，用 Record 强制穷举，新增枚举时编译期报错 */
const GENDER_LABEL: Readonly<Record<ConsultOrder['patient']['gender'], string>> = {
  MALE: '男',
  FEMALE: '女',
  UNKNOWN: '未知',
}

interface RecordRow {
  key: string
  label: string
  value: string
  /** 长文本行：两行省略 + title，避免主诉把侧栏撑成一整屏 */
  ellipsis?: boolean
}

/**
 * 资料行。
 * 患者字段全部取后端已脱敏的值（nameMasked / idCardMasked / inpatientNoMasked），
 * 前端只展示、不还原——这里再套一层脱敏会把 `李**` 二次打码成 `李*`，反而看不出原格式。
 */
const recordRows = computed<RecordRow[]>(() => {
  const order = record.value
  if (!order) {
    return []
  }
  return [
    { key: 'name', label: '姓名', value: order.patient.nameMasked },
    { key: 'gender', label: '性别', value: GENDER_LABEL[order.patient.gender] },
    { key: 'age', label: '年龄', value: `${order.patient.age} 岁` },
    { key: 'inpatientNo', label: '住院号', value: order.patient.inpatientNoMasked ?? '—' },
    { key: 'idCard', label: '证件号', value: order.patient.idCardMasked ?? '—' },
    { key: 'department', label: '科室', value: order.departmentName },
    { key: 'purpose', label: '会诊目的', value: order.consultPurpose, ellipsis: true },
    { key: 'complaint', label: '主诉', value: order.chiefComplaint || '—', ellipsis: true },
    { key: 'diagnosis', label: '诊断摘要', value: order.diagnosisSummary || '—', ellipsis: true },
  ]
})
</script>

<template>
  <aside class="room-sidebar">
    <div class="room-sidebar__tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        class="room-sidebar__tab"
        :class="{ 'room-sidebar__tab--active': activeTab === tab.key }"
        :aria-selected="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 参会方 -->
    <template v-if="activeTab === 'members'">
      <div class="room-sidebar__header">
        <span class="room-sidebar__title">参会方</span>
        <span class="room-sidebar__count">{{ onlineCount }}/{{ room.maxParticipants }}</span>
      </div>

      <div class="room-sidebar__body">
        <div
          v-for="item in participants"
          :key="item.participantId"
          class="participant-row"
          :class="{ 'participant-row--self': item.participantId === self?.participantId }"
        >
          <span class="participant-row__avatar" aria-hidden="true">{{ avatarText(item.displayName) }}</span>

          <div class="participant-row__main">
            <div class="participant-row__line">
              <span class="participant-row__name">{{ item.displayName }}</span>
              <span v-if="item.participantId === self?.participantId" class="participant-row__self">(你)</span>
              <span
                class="participant-row__role"
                :class="{ 'participant-row__role--host': item.role === 'HOST' }"
              >
                {{ ROOM_ROLE_META[item.role].label }}
              </span>
            </div>

            <div class="participant-row__line">
              <span
                class="participant-row__dot"
                :class="{ 'participant-row__dot--animated': ROOM_PRESENCE_META[item.presence].animated }"
                :style="{ background: presenceColor(item.presence) }"
                aria-hidden="true"
              />
              <span class="participant-row__presence">{{ ROOM_PRESENCE_META[item.presence].label }}</span>

              <svg
                class="participant-row__mic"
                :class="{ 'participant-row__mic--muted': item.micMuted }"
                :title="micTitle(item.micMuted)"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="3" width="6" height="10" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
                <path v-if="item.micMuted" d="M4 4l16 16" />
              </svg>
            </div>
          </div>

          <el-dropdown
            v-if="canOperate(item)"
            trigger="click"
            placement="bottom-end"
            popper-class="room-sidebar__menu"
            @command="(command: unknown) => handleCommand(item, command)"
          >
            <span
              class="participant-row__more"
              role="button"
              tabindex="0"
              :aria-label="`${item.displayName} 的操作`"
              :class="{ 'participant-row__more--busy': pendingId === item.participantId }"
            >
              ⋮
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :command="item.micMuted ? 'UNMUTE' : 'MUTE'">
                  {{ item.micMuted ? '取消静音' : '静音' }}
                </el-dropdown-item>
                <el-dropdown-item command="REMOVE" divided class="participant-row__menu-danger">
                  移出会场
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div class="room-sidebar__footer">
        <el-button class="room-sidebar__leave" @click="emit('leave-room')">离开会场</el-button>
      </div>
    </template>

    <!-- 消息 -->
    <div v-else-if="activeTab === 'chat'" class="room-chat">
      <div ref="chatListRef" class="room-chat__list">
        <div
          v-for="message in messages"
          :key="message.id"
          class="room-chat__item"
          :class="{
            'room-chat__item--self': message.self,
            'room-chat__item--system': message.from === SYSTEM_SENDER,
          }"
        >
          <span class="room-chat__meta">{{ message.fromName }} · {{ message.at }}</span>
          <div class="room-chat__bubble">{{ message.text }}</div>
        </div>
      </div>

      <div class="room-chat__input">
        <el-input
          v-model="draft"
          class="room-chat__field"
          size="small"
          maxlength="200"
          placeholder="输入消息，回车发送"
          @keyup.enter="sendMessage"
        />
        <el-button type="primary" size="small" :disabled="draft.trim() === ''" @click="sendMessage">
          发送
        </el-button>
      </div>
    </div>

    <!-- 资料 -->
    <div v-else class="room-record">
      <div v-if="recordLoading" class="room-record__skeleton">
        <div v-for="row in 6" :key="row" class="room-record__skeleton-row" />
      </div>

      <div v-else-if="recordError !== ''" class="room-record__error">
        <p class="room-record__error-title">资料加载失败</p>
        <p class="room-record__error-detail">{{ recordError }}</p>
        <el-button size="small" @click="loadRecord">重试</el-button>
      </div>

      <template v-else-if="record">
        <div class="room-record__patient">
          <span class="room-record__patient-name">{{ record.patient.nameMasked }}</span>
          <span class="room-record__patient-meta">
            {{ GENDER_LABEL[record.patient.gender] }} · {{ record.patient.age }} 岁
          </span>
        </div>

        <div v-for="row in recordRows" :key="row.key" class="room-record__row">
          <span class="room-record__label">{{ row.label }}</span>
          <span
            class="room-record__value"
            :class="{ 'room-record__value--ellipsis': row.ellipsis }"
            :title="row.ellipsis ? row.value : undefined"
          >
            {{ row.value }}
          </span>
        </div>

        <!-- DICOM 影像占位：接口在 ports/dicom-provider 已定义，W11 接入后替换成阅片器 -->
        <div class="room-record__imaging">
          <span class="room-record__imaging-text">DICOM 影像待接入（port 已定义，实现见 W11）</span>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.room-sidebar {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 320px;
  height: 100%;
  background: var(--color-bg-container);
  border-left: 1px solid var(--color-border-light);
}

.room-sidebar__tabs {
  display: flex;
  flex: none;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md) 0;
  border-bottom: 1px solid var(--color-border-light);
}

.room-sidebar__tab {
  position: relative;
  padding: var(--spacing-sm) var(--spacing-xs);
  border: none;
  background: none;
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.room-sidebar__tab:hover {
  color: var(--color-primary);
}

/* 激活态用「主色文字 + 底部 2px 主色条」：侧栏窄，加底色会显得整条页签很重 */
.room-sidebar__tab--active {
  color: var(--color-primary);
  font-weight: 600;
}

.room-sidebar__tab--active::after {
  position: absolute;
  right: var(--spacing-xs);
  bottom: -1px;
  left: var(--spacing-xs);
  height: 2px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  content: '';
}

.room-sidebar__header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-md) var(--spacing-xs);
}

.room-sidebar__title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

.room-sidebar__count {
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-tertiary);
}

.room-sidebar__body {
  flex: 1;
  min-height: 0;
  padding: 0 var(--spacing-sm) var(--spacing-sm);
  overflow-y: auto;
}

.room-sidebar__footer {
  flex: none;
  padding: var(--spacing-md);
  border-top: 1px solid var(--color-border-light);
}

.room-sidebar__leave {
  width: 100%;
}

/* ---------------- 参会方行 ---------------- */

.participant-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border-radius: var(--radius-md);
}

.participant-row:hover {
  background: var(--color-bg-hover);
}

/* 自己那一行给浅色底：一屏 5 个人时，主持人需要 0.2 秒内定位到自己 */
.participant-row--self {
  background: var(--color-bg-muted);
}

.participant-row__avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--color-primary-bg);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-primary);
}

.participant-row__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.participant-row__line {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  min-width: 0;
}

.participant-row__name {
  overflow: hidden;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.participant-row__self {
  flex: none;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.participant-row__role {
  flex: none;
  padding: 0 var(--spacing-xs);
  border-radius: var(--radius-sm);
  background: var(--color-bg-hover);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

/* 主持人用主色：角色标签是扫视时的第一落点，别让 4 个人长得一样 */
.participant-row__role--host {
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

.participant-row__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
}

/* 呼吸动画只给 animated 态（断线重连中）：静止的在线态加动画会让人以为全都在抖 */
.participant-row__dot--animated {
  animation: participant-row-breathe 1.4s ease-in-out infinite;
}

@keyframes participant-row-breathe {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.3;
  }
}

.participant-row__presence {
  flex: none;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.participant-row__mic {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--color-text-tertiary);
}

.participant-row__mic--muted {
  color: var(--status-danger);
}

.participant-row__more {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-lg);
  line-height: 20px;
  text-align: center;
  color: var(--color-text-tertiary);
  cursor: pointer;
  user-select: none;
}

.participant-row__more:hover {
  background: var(--color-bg-active);
  color: var(--color-text-primary);
}

/* 请求进行中把入口压暗：同一行的连点会撞上 pendingId 的锁，压暗能让「已经点过了」看得见 */
.participant-row__more--busy {
  opacity: 0.4;
  pointer-events: none;
}

/* ---------------- 消息 ---------------- */

.room-chat {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.room-chat__list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--spacing-md);
  min-height: 0;
  padding: var(--spacing-md);
  overflow-y: auto;
}

.room-chat__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  max-width: 100%;
}

.room-chat__item--self {
  align-items: flex-end;
}

.room-chat__item--system {
  align-items: center;
}

.room-chat__meta {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

/* 系统消息不展示发信人与时间：它不是某个人的发言，带上 meta 会被误读成「系统这个人」 */
.room-chat__item--system .room-chat__meta {
  display: none;
}

.room-chat__bubble {
  max-width: 230px;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background: var(--color-bg-muted);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  word-break: break-word;
}

.room-chat__item--self .room-chat__bubble {
  background: var(--color-primary-bg);
}

.room-chat__item--system .room-chat__bubble {
  padding: 0;
  background: none;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.room-chat__input {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border-top: 1px solid var(--color-border-light);
}

.room-chat__field {
  flex: 1;
  min-width: 0;
}

/* ---------------- 资料 ---------------- */

.room-record {
  flex: 1;
  min-height: 0;
  padding: var(--spacing-md);
  overflow-y: auto;
}

.room-record__patient {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--color-border-light);
}

.room-record__patient-name {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--color-text-primary);
}

.room-record__patient-meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.room-record__row {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--color-border-light);
}

/* 标签定宽而不是按内容撑开：值这一列对齐后，扫读病历信息的成本明显更低 */
.room-record__label {
  flex: none;
  width: 64px;
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.room-record__value {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  word-break: break-word;
}

/* 两行截断：主诉/诊断动辄上百字，全量展开会把侧栏撑到看不出还有多少条 */
.room-record__value--ellipsis {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.room-record__imaging {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  margin-top: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  /* 网格底暗示「这里以后是影像区」，用重复渐变画，不额外引一张图 */
  background-image: repeating-linear-gradient(
      0deg,
      var(--color-border-light) 0 1px,
      transparent 1px 12px
    ),
    repeating-linear-gradient(90deg, var(--color-border-light) 0 1px, transparent 1px 12px);
  background-color: var(--color-bg-muted);
  text-align: center;
}

.room-record__imaging-text {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.room-record__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.room-record__skeleton-row {
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-muted);
  animation: room-record-pulse 1.2s ease-in-out infinite;
}

@keyframes room-record-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }
}

.room-record__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-xs);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background: var(--color-bg-muted);
}

.room-record__error-title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text-primary);
}

.room-record__error-detail {
  margin: 0 0 var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}
</style>

<!-- 下拉菜单挂到 body 上（teleport），scoped 样式够不到，只能靠 popper-class 单独命名 -->
<style>
.room-sidebar__menu .participant-row__menu-danger {
  color: var(--status-danger);
}

.room-sidebar__menu .participant-row__menu-danger:hover {
  background: color-mix(in srgb, var(--status-danger) 10%, transparent);
  color: var(--status-danger);
}
</style>
