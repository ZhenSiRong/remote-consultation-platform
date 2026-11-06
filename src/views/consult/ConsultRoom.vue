<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Room, RoomParticipant } from '@/api/types'
import { ApiError } from '@/api/request'
import { fetchConsultDetail } from '@/api/consult'
import {
  fetchRoomByConsultation,
  joinRoom,
  leaveRoom,
  startRecording,
  stopRecording,
  updateMediaState,
} from '@/api/room'
import { ROOM_PRESENCE_META, ROOM_ROLE_META, formatRoomDuration } from '@/domain/room/presence'
import { EmptyState } from '@/components/EmptyState'
import RoomSidebar from '@/components/room/RoomSidebar.vue'
import RoomEndDialog from '@/components/room/RoomEndDialog.vue'
import { useRoomStore } from '@/store/modules/room'
import { useRtc } from '@/composables/useRtc'

/**
 * 会诊室（视频会诊进行中）。
 *
 * 这一页的定位是「会场」，不是「工单详情」：进来的人只关心四件事——
 * 对面是谁、我自己的设备状态、我现在能不能说/能不能看、以及怎么安全退出。
 * 所以布局固定成 顶部信息条 + 主画面 + 右侧栏 + 底部控制条，
 * 不做滚动页面，避免会诊途中为了找按钮而滚动、错过对方说话。
 *
 * 关键取舍：
 * 1. **音视频真实直连**。主画面/本地小窗都绑真实 MediaStream（见 useRtc），
 *    但只有「2 方 P2P」：房间里的第三人会把前一路顶掉，这是 A 档的能力边界。
 *    没有摄像头 / 服务端没起时仍然回落到占位画面，会场本身不因此进不来。
 * 2. **room 只在接口里**。轮询每 2 秒拉一次整份 Room，本地不复制一份权威态，
 *    否则静音别人之后「成员卡片已灰、底部开关还亮」的自相矛盾必然出现（与 store 注释同源）。
 * 3. **轮询失败不弹 toast**。网络抖动在会场里是常态，弹窗会把用户从会诊中拽出来；
 *    连续失败 3 次才在顶部挂一个「连接不稳定」，提示但不打断。
 */

/** 与 RoomPrecheck.vue 保持同一个本地参会人标识；接真实鉴权后替换为当前用户 id */
const LOCAL_PARTICIPANT_ID = 'host-local'
/** 会场轮询间隔：2 秒足够接住「断线重连中」这类秒级状态，又不会把 mock 打满 */
const POLL_INTERVAL_MS = 2000
/** 连续失败到这个次数才认为「不是抖一下」，值得在顶部提示 */
const POLL_FAILURE_LIMIT = 3

/** 网络质量三档：只用于顶部文案，不参与任何业务判断 */
type NetworkLevel = 'good' | 'fair' | 'offline'

/** navigator.connection 不在标准 DOM 类型里，单独收窄需要的字段 */
interface NavigatorConnectionLike {
  effectiveType?: string
}

const route = useRoute()
const router = useRouter()
const store = useRoomStore()

/** 路由参数用 computed：同一组件内切换到另一张会诊单时不必重新挂载 */
const consultationId = computed(() => String(route.params.id ?? ''))
const selfId = LOCAL_PARTICIPANT_ID

const room = ref<Room | null>(null)
const loading = ref(true)
const loadError = ref('')
/** 会诊单号（顶部条展示用）；取不到时只显示会场号 */
const orderNo = ref('')

/** 时长计时用的共享时间源：整页只有一个 now，避免同屏出现两个不同的秒数 */
const now = ref(new Date())

const endVisible = ref(false)
/** 主画面是否切换成自己（点右下角小窗互换） */
const mainIsLocal = ref(false)
/** 影像共享占位态：演示环境没有 DICOM 通道，仅做交互占位 */
const sharing = ref(false)

const pollFailures = ref(0)
const recordingNoticeVisible = ref(false)
const networkLevel = ref<NetworkLevel>('good')

/** 三个写操作各自 pending，互不阻塞：录制中仍然可以静音自己 */
const micPending = ref(false)
const cameraPending = ref(false)
const recordPending = ref(false)

/**
 * 真实音视频直连（A 档：2 方 P2P，无媒体服务器）。
 * 信令 roomId 用会诊单 id 而不是会场 id：两者一对一，但信令属于「会话」层，
 * 跟着会诊单走，会场被重建时（重开、换主持人）连接路径不用跟着变。
 * 拆成 ref 而不是保留 rtc.xxx：模板只自动解包顶层 ref，写成 rtc.remoteStream 会拿不到值。
 */
const {
  localStream,
  remoteStream,
  state: rtcState,
  error: rtcError,
  setLocalAudioEnabled,
  setLocalVideoEnabled,
  hangup: rtcHangup,
  reconnect: rtcReconnect,
} = useRtc({ roomId: () => consultationId.value || null })

/** 摄像头是否真的出画面：无设备时流里只有音轨，此时仍要显示占位而不是一块黑 */
const hasLocalVideo = computed(() => (localStream.value?.getVideoTracks().length ?? 0) > 0)

/**
 * rtcError 里的都是「要让人知道，但不必打断会诊」的事：授权被拒、信令没起、
 * 第三人顶掉了这路视频。用 toast 承载，不占主画面；需要用户动手的（连接失败）另有页内占位 + 重试。
 */
watch(rtcError, (message) => {
  if (message) {
    ElMessage.warning(message)
  }
})

/** 卸载后所有异步回调都不许再写 ref，否则会在已销毁的组件上触发更新 */
let disposed = false
let pollTimer: ReturnType<typeof setInterval> | null = null
let durationTimer: ReturnType<typeof setInterval> | null = null
/** 本地开关只从首次加载同步一次：轮询会把接口态带回来，不能覆盖用户正在切换的乐观态 */
let localStateSynced = false

// ---------------------------------------------------------------- 派生状态

const selfParticipant = computed<RoomParticipant | null>(
  () => room.value?.participants.find((item) => item.participantId === selfId) ?? null,
)

/**
 * 在场人数 = 在线 + 断线重连中。
 * 邀请中的人还没进来、已离会的人不占名额，两者都不该算「人在场」，
 * 否则顶部会显示 5/5 满员，而画面上只有 3 个人。
 */
const onlineCount = computed(() => {
  const participants = room.value?.participants ?? []
  return participants.filter((item) => item.presence === 'ONLINE' || item.presence === 'RECONNECTING')
    .length
})

const durationText = computed(() => formatRoomDuration(room.value?.openedAt ?? null, now.value))
const isRecording = computed(() => room.value?.recording.status === 'RECORDING')
const isClosed = computed(() => room.value?.status === 'CLOSED')
const controlsDisabled = computed(() => loading.value || isClosed.value)

/**
 * 主画面对象：优先 PRESENTER（发言权在谁那里，主画面就该是谁），
 * 没有发言人时退到第一个在线的别人。
 * 注意这里**不排除 LEFT 的 PRESENTER**：对方中途掉线离会时，
 * 主画面应该明确告诉观众「对方已离会」，而不是悄悄换成另一个人。
 */
function pickMainParticipant(
  participants: RoomParticipant[],
  excludeId: string,
): RoomParticipant | null {
  const presenter = participants.find((item) => item.role === 'PRESENTER')
  if (presenter) {
    return presenter
  }
  return (
    participants.find((item) => item.participantId !== excludeId && item.presence === 'ONLINE') ??
    null
  )
}

const remoteMain = computed<RoomParticipant | null>(() =>
  room.value ? pickMainParticipant(room.value.participants, selfId) : null,
)

const mainParticipant = computed<RoomParticipant | null>(() => {
  if (mainIsLocal.value && selfParticipant.value) {
    return selfParticipant.value
  }
  return remoteMain.value
})

const mainIsSelf = computed(() => mainParticipant.value?.participantId === selfId)
const mainPresence = computed<RoomParticipant['presence']>(
  () => mainParticipant.value?.presence ?? 'ONLINE',
)
const mainPresenceLabel = computed(() => ROOM_PRESENCE_META[mainPresence.value].label)
/** 字典里的 token 是 '--status-*' 字符串，拼成 var() 才能落到颜色上 */
const mainPresenceColor = computed(() => `var(${ROOM_PRESENCE_META[mainPresence.value].token})`)
const mainRoleLabel = computed(() =>
  mainParticipant.value ? ROOM_ROLE_META[mainParticipant.value.role].label : '',
)
const mainName = computed(() => mainParticipant.value?.displayName ?? '暂无在场参会方')
const mainInitial = computed(() => (mainParticipant.value?.displayName ?? '—').slice(0, 1))

const selfRoleLabel = computed(() =>
  selfParticipant.value ? ROOM_ROLE_META[selfParticipant.value.role].label : '参会者',
)
const selfInitial = computed(() => (selfParticipant.value?.displayName ?? '我').slice(0, 1))
const remoteName = computed(() => remoteMain.value?.displayName ?? '远端')
const remoteInitial = computed(() => (remoteMain.value?.displayName ?? '远').slice(0, 1))

const networkLabel = computed(() => {
  if (networkLevel.value === 'offline') {
    return '已断网'
  }
  return networkLevel.value === 'fair' ? '网络一般' : '网络良好'
})

// ---------------------------------------------------------------- 网络

/**
 * 读取浏览器网络状态。
 * navigator.onLine 只能判断「有没有链路」，effectiveType 才能区分 4G/3G；
 * 两者都拿不到时按「良好」处理——演示环境里没理由一进来就报黄。
 */
function refreshNetwork(): void {
  if (!navigator.onLine) {
    networkLevel.value = 'offline'
    return
  }
  const connection = (navigator as Navigator & { connection?: NavigatorConnectionLike }).connection
  const effectiveType = connection?.effectiveType
  networkLevel.value =
    effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g'
      ? 'fair'
      : 'good'
}

// ---------------------------------------------------------------- 会场数据

function describeError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/** 首次加载成功时，用接口里的「我」初始化本地开关；之后交给用户操作，轮询不再覆盖 */
function syncLocalStateFromRoom(next: Room): void {
  if (localStateSynced) {
    return
  }
  const self = next.participants.find((item) => item.participantId === selfId)
  if (!self) {
    return
  }
  store.localMicMuted = self.micMuted
  store.localCameraOn = self.cameraOn
  localStateSynced = true
}

async function loadOrderNo(): Promise<void> {
  try {
    const detail = await fetchConsultDetail(consultationId.value)
    if (!disposed) {
      orderNo.value = detail.orderNo
    }
  } catch {
    // 工单号只是辅助信息：拿不到就只显示会场号，不打扰正在进会的人
  }
}

async function loadRoom(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    let next = await fetchRoomByConsultation(consultationId.value)

    /*
     * 进入会诊室即入会。
     * 不能只在「自己不在参会方里」时才 join：mock 的种子数据里主持人已经在线，
     * 但会场的 status 还是 CREATED、openedAt 还是 null（契约要求「主持人真正入会才开表」），
     * 少了这次 join 顶部计时会永远停在 00:00。
     * 对已入会的人是幂等的（同一个人重进不会多出一行），所以每次进页面都调用。
     * 会场已结束时 join 会直接报错，这里跳过——结束态由下面的 CLOSED 遮罩处理。
     */
    if (next.status !== 'CLOSED') {
      next = await joinRoom(next.id, { participantId: selfId, role: 'HOST' })
    }

    if (disposed) {
      return
    }
    room.value = next
    pollFailures.value = 0
    syncLocalStateFromRoom(next)
    startPolling()
  } catch (error) {
    if (!disposed) {
      loadError.value = describeError(error, '会场加载失败，请稍后重试')
    }
  } finally {
    if (!disposed) {
      loading.value = false
    }
  }
}

/**
 * 轮询 / 侧栏操作后的静默刷新。
 * 失败只累加计数、保留上一次数据：会场里最忌讳因为一次请求失败就把画面清空。
 */
async function pollRoom(): Promise<void> {
  if (disposed || !room.value || room.value.status === 'CLOSED') {
    return
  }
  try {
    const next = await fetchRoomByConsultation(consultationId.value)
    if (disposed) {
      return
    }
    room.value = next
    pollFailures.value = 0
    if (next.status === 'CLOSED') {
      stopPolling()
      // 会场已关闭就不该继续占着摄像头，也不该继续挂在信令上等下一轮 offer
      rtcHangup()
    }
  } catch {
    if (!disposed) {
      pollFailures.value += 1
    }
  }
}

function startPolling(): void {
  if (pollTimer) {
    return
  }
  pollTimer = setInterval(() => {
    void pollRoom()
  }, POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/**
 * RTC 的可读错误统一弹一次 toast。
 * 典型三条：第三人进来顶掉前一路（2 方上限）、设备被拒/被占用、信令连不上。
 * 放在 toast 而不是占位上：这类信息需要「说一次」，但不需要一直压在画面中央。
 */
watch(rtcError, (message) => {
  if (message && !disposed) {
    ElMessage.warning(message)
  }
})

// ---------------------------------------------------------------- 媒体开关

async function toggleMic(): Promise<void> {
  if (!room.value || micPending.value) {
    return
  }
  const nextMuted = !store.localMicMuted
  micPending.value = true
  // 先乐观切换：静音是高频操作，等接口回来再变会让用户以为没点上
  store.localMicMuted = nextMuted
  /*
   * 两件事必须都做，缺一不可：
   * 1. 关本地音频轨 —— 这是对方真的听不到的唯一手段；
   * 2. 上报接口 —— 后端要记住谁静音了，侧栏成员卡片与「谁在说话」才不是假的。
   * 只做第 2 条的旧实现，按钮亮了但声音照发，属于演示里最容易被戳穿的那种假。
   */
  setLocalAudioEnabled(!nextMuted)
  try {
    room.value = await updateMediaState(room.value.id, selfId, { micMuted: nextMuted })
  } catch (error) {
    store.localMicMuted = !nextMuted
    setLocalAudioEnabled(nextMuted)
    ElMessage.error(describeError(error, '麦克风状态切换失败，请稍后重试'))
  } finally {
    micPending.value = false
  }
}

async function toggleCamera(): Promise<void> {
  if (!room.value || cameraPending.value) {
    return
  }
  const nextOn = !store.localCameraOn
  cameraPending.value = true
  store.localCameraOn = nextOn
  // 只改 track.enabled，不摘轨：摘轨会触发重新协商，对端画面会黑一下再回来
  setLocalVideoEnabled(nextOn)
  try {
    room.value = await updateMediaState(room.value.id, selfId, { cameraOn: nextOn })
  } catch (error) {
    store.localCameraOn = !nextOn
    setLocalVideoEnabled(!nextOn)
    ElMessage.error(describeError(error, '摄像头状态切换失败，请稍后重试'))
  } finally {
    cameraPending.value = false
  }
}

async function toggleRecording(): Promise<void> {
  if (!room.value || recordPending.value) {
    return
  }
  const wasRecording = isRecording.value
  recordPending.value = true
  try {
    room.value = wasRecording
      ? await stopRecording(room.value.id)
      : await startRecording(room.value.id)
  } catch (error) {
    // 50003 = 没有可用视频流：必须原样把后端原因说出来，用户才知道去开摄像头而不是反复点录制
    ElMessage.error(describeError(error, wasRecording ? '停止录制失败，请稍后重试' : '开始录制失败，请稍后重试'))
  } finally {
    recordPending.value = false
  }
}

// ---------------------------------------------------------------- 录制合规提示（R13）

/**
 * 录制提示：进会诊室后首次、且会场确实在录制时弹一次。
 * 用 watch 而不是只在 load 后判断一次：用户自己点「录制」时同样要看到这条提示，
 * 否则「我点了录制但没人告诉我这会被留痕」在合规上说不通。
 */
watch(
  isRecording,
  (recording) => {
    if (recording && !store.recordingNoticeShown) {
      recordingNoticeVisible.value = true
    }
  },
  { immediate: true },
)

function acknowledgeRecordingNotice(): void {
  recordingNoticeVisible.value = false
  store.recordingNoticeShown = true
}

// ---------------------------------------------------------------- 离开

function stopAll(): void {
  stopPolling()
  // 挂断是幂等的：返回工单和组件销毁都会走到这里，重复调用不会留下副作用
  rtcHangup()
}

function goBackToOrder(): void {
  stopAll()
  void router.push(`/consult/${consultationId.value}`)
}

async function handleLeave(): Promise<void> {
  if (!room.value) {
    return
  }
  try {
    await ElMessageBox.confirm('离开后可从工单详情重新进入，确认离开？', '离开会场', {
      confirmButtonText: '确认离开',
      cancelButtonText: '继续留在会场',
      type: 'warning',
    })
  } catch {
    // 用户取消：ElMessageBox 以 reject 表达取消，不是错误
    return
  }

  try {
    await leaveRoom(room.value.id, selfId)
  } catch (error) {
    ElMessage.error(describeError(error, '离开会场失败，请稍后重试'))
    return
  }
  goBackToOrder()
}

function handleEnded(): void {
  ElMessage.success('会诊已结束，等待签署')
  goBackToOrder()
}

// ---------------------------------------------------------------- 生命周期

onMounted(() => {
  // 换了一张会诊单才重置：同一张单离开再回来，侧栏页签和「已提示录制」应当保留
  if (store.consultationId && store.consultationId !== consultationId.value) {
    store.reset()
  }
  store.consultationId = consultationId.value

  refreshNetwork()
  window.addEventListener('online', refreshNetwork)
  window.addEventListener('offline', refreshNetwork)
  durationTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)

  void loadRoom()
  void loadOrderNo()
})

onBeforeUnmount(() => {
  disposed = true
  stopAll()
  if (durationTimer) {
    clearInterval(durationTimer)
    durationTimer = null
  }
  window.removeEventListener('online', refreshNetwork)
  window.removeEventListener('offline', refreshNetwork)
})
</script>

<template>
  <div class="consult-room">
    <!-- 首次加载：整页骨架。会场没有「部分可用」的中间态，先给骨架比先闪一帧空画面稳 -->
    <div v-if="loading && !room" class="consult-room__skeleton">
      <el-skeleton :rows="8" animated />
    </div>

    <!-- 首次加载失败：拿不到 room 就没有任何可操作项，只能重试 -->
    <div v-else-if="loadError && !room" class="consult-room__error">
      <EmptyState
        type="error"
        title="会场加载失败"
        :description="loadError"
        action-text="重新加载"
        @action="loadRoom"
      />
    </div>

    <template v-else-if="room">
      <header class="consult-room__topbar">
        <div class="consult-room__identity">
          <span class="consult-room__room-no">{{ room.roomNo }}</span>
          <template v-if="orderNo">
            <span class="consult-room__divider">·</span>
            <span class="consult-room__order-no">会诊 {{ orderNo }}</span>
          </template>
          <span class="consult-room__divider">·</span>
          <span class="consult-room__duration">
            时长 <strong>{{ durationText }}</strong>
          </span>
        </div>

        <div class="consult-room__status">
          <span v-if="isRecording" class="consult-room__recording">
            <i class="consult-room__recording-dot" aria-hidden="true" />
            录制中
          </span>
          <span v-else class="consult-room__recording consult-room__recording--idle">未录制</span>

          <span class="consult-room__divider">·</span>
          <span>{{ onlineCount }}/{{ room.maxParticipants }} 人在场</span>

          <span class="consult-room__divider">·</span>
          <span class="consult-room__network" :class="`consult-room__network--${networkLevel}`">
            <i class="consult-room__network-dot" aria-hidden="true" />
            {{ networkLabel }}
          </span>

          <!-- 视频链路是比「网络良好」更硬的证据：网络绿不代表 P2P 通了，所以单独一个点 -->
          <template v-if="rtcState === 'connected'">
            <span class="consult-room__divider">·</span>
            <span class="consult-room__rtc-connected">
              <i class="consult-room__rtc-dot" aria-hidden="true" />
              视频已连接
            </span>
          </template>

          <span v-if="pollFailures >= POLL_FAILURE_LIMIT" class="consult-room__unstable">
            连接不稳定
          </span>
        </div>
      </header>

      <div class="consult-room__body">
        <section class="consult-room__stage">
          <!-- 影像共享占位：演示环境没有 DICOM 通道，用网格底明确「这是占位，不是坏了」 -->
          <div v-if="sharing" class="consult-room__share">
            <span class="consult-room__share-badge">影像共享中</span>
            <div class="consult-room__share-center">
              <p class="consult-room__share-title">DICOM 影像共享待接入</p>
              <p class="consult-room__share-desc">接入影像工作站后，此处将显示本次会诊调阅的检查序列</p>
            </div>
          </div>

          <!-- 远端主画面 -->
          <div
            v-else
            class="consult-room__remote"
            :class="{ 'consult-room__remote--left': mainPresence === 'LEFT' }"
          >
            <!--
              主画面优先真实流：显示自己时绑本地流（必须 muted，否则会自激啸叫），
              显示对方时绑远端流。没有流才落到下面的占位。
            -->
            <video
              v-if="mainIsSelf && store.localCameraOn && hasLocalVideo"
              class="consult-room__remote-video"
              autoplay
              muted
              playsinline
              :srcObject="localStream"
            />
            <video
              v-else-if="!mainIsSelf && remoteStream"
              class="consult-room__remote-video"
              autoplay
              playsinline
              :srcObject="remoteStream"
            />

            <!--
              断线重连 / 已离会时不渲染正常态的头像块：遮罩与它叠在同一中心点会互相压字。
              改由遮罩自己带一个压暗的头像 + 状态，语义不变（头像区叠加半透明遮罩），
              但排版上只有一个中心，读起来干净。
            -->
            <template
              v-else-if="
                mainParticipant && mainPresence !== 'RECONNECTING' && mainPresence !== 'LEFT'
              "
            >
              <div class="consult-room__avatar consult-room__avatar--lg">{{ mainInitial }}</div>
              <p class="consult-room__remote-name">{{ mainName }}</p>
              <p class="consult-room__remote-presence" :style="{ color: mainPresenceColor }">
                {{ mainPresenceLabel }}
              </p>
            </template>

            <!--
              「暂无在场参会方」与连接态互斥：正在连的时候说「没人」会让人以为连错了地方，
              所以连接中/失败时只说连接的事。
            -->
            <p
              v-else-if="!mainParticipant && rtcState !== 'connecting' && rtcState !== 'failed'"
              class="consult-room__remote-empty"
            >
              暂无在场参会方
            </p>

            <!--
              连接状态只叠在占位上：有真实画面时不加任何提示，画面本身就是最好的状态。
              connecting 用转圈，failed 给重试入口——会场里没有别的地方能让用户自救。
            -->
            <div
              v-if="!mainIsSelf && !remoteStream && rtcState === 'connecting'"
              class="consult-room__rtc-hint"
            >
              <span class="consult-room__spinner" aria-hidden="true" />
              <p class="consult-room__rtc-text">正在建立视频连接…</p>
            </div>
            <div
              v-else-if="!mainIsSelf && !remoteStream && rtcState === 'failed'"
              class="consult-room__rtc-hint"
            >
              <p class="consult-room__rtc-text">视频连接失败</p>
              <p v-if="rtcError" class="consult-room__rtc-sub">{{ rtcError }}</p>
              <el-button size="small" type="primary" plain @click="rtcReconnect">重试</el-button>
            </div>

            <span v-if="mainParticipant" class="consult-room__role-tag">{{ mainRoleLabel }}</span>

            <!-- 断线重连：半透明遮罩 + 转圈，告诉观众「不是没画面，是在等链路回来」 -->
            <div
              v-if="mainParticipant && mainPresence === 'RECONNECTING'"
              class="consult-room__overlay"
            >
              <div class="consult-room__overlay-avatar">{{ mainInitial }}</div>
              <span class="consult-room__spinner" aria-hidden="true" />
              <p class="consult-room__overlay-text">断线重连中</p>
            </div>
            <div
              v-else-if="mainParticipant && mainPresence === 'LEFT'"
              class="consult-room__overlay consult-room__overlay--left"
            >
              <div class="consult-room__overlay-avatar">{{ mainInitial }}</div>
              <p class="consult-room__overlay-text">对方已离会</p>
            </div>
          </div>

          <!-- 本地小窗：点击与主画面互换 -->
          <button
            class="consult-room__local"
            type="button"
            :title="mainIsLocal ? '切回远端主画面' : '把自己切到主画面'"
            @click="mainIsLocal = !mainIsLocal"
          >
            <template v-if="!mainIsLocal">
              <video
                v-if="store.localCameraOn && hasLocalVideo"
                class="consult-room__local-video"
                autoplay
                muted
                playsinline
                :srcObject="localStream"
              />
              <span v-else class="consult-room__local-placeholder">
                <span class="consult-room__avatar consult-room__avatar--sm">{{ selfInitial }}</span>
                <span class="consult-room__local-hint">摄像头未开启</span>
              </span>
              <span class="consult-room__local-label">你（{{ selfRoleLabel }}）</span>
            </template>

            <template v-else>
              <span class="consult-room__local-placeholder">
                <span class="consult-room__avatar consult-room__avatar--sm">{{ remoteInitial }}</span>
                <span class="consult-room__local-hint">{{ remoteName }}</span>
              </span>
              <span class="consult-room__local-label">远端画面</span>
            </template>
          </button>

          <!-- 会场已结束：盖住整块画面，避免用户继续对着一个已关闭的会场点按钮 -->
          <div v-if="isClosed" class="consult-room__closed">
            <p class="consult-room__closed-title">会场已结束</p>
            <p class="consult-room__closed-desc">本次会诊的音视频会场已关闭，可返回工单查看会诊记录</p>
            <el-button type="primary" @click="goBackToOrder">返回工单</el-button>
          </div>
        </section>

        <RoomSidebar
          class="consult-room__sidebar"
          :room="room"
          :self-id="selfId"
          @refresh="pollRoom"
          @leave-room="handleLeave"
        />
      </div>

      <footer class="consult-room__controls">
        <button
          class="room-controls__btn room-controls__btn--mic"
          :class="{ 'is-active': store.localMicMuted }"
          type="button"
          :disabled="controlsDisabled || micPending"
          :aria-pressed="store.localMicMuted"
          @click="toggleMic"
        >
          <span class="room-controls__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3" />
              <path v-if="store.localMicMuted" d="M4 4l16 16" stroke="var(--status-danger)" />
            </svg>
          </span>
          <span class="room-controls__label">麦克风</span>
        </button>

        <button
          class="room-controls__btn room-controls__btn--camera"
          :class="{ 'is-active': !store.localCameraOn }"
          type="button"
          :disabled="controlsDisabled || cameraPending"
          :aria-pressed="!store.localCameraOn"
          @click="toggleCamera"
        >
          <span class="room-controls__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="6" width="12" height="12" rx="2" />
              <path d="M15 10l6-3v10l-6-3z" />
              <path v-if="!store.localCameraOn" d="M4 4l16 16" stroke="var(--status-danger)" />
            </svg>
          </span>
          <span class="room-controls__label">摄像头</span>
        </button>

        <button
          class="room-controls__btn room-controls__btn--share"
          :class="{ 'is-sharing': sharing }"
          type="button"
          :disabled="controlsDisabled"
          :aria-pressed="sharing"
          @click="sharing = !sharing"
        >
          <span class="room-controls__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8" />
              <path d="M12 16v4" />
            </svg>
          </span>
          <span class="room-controls__label">共享影像</span>
        </button>

        <button
          class="room-controls__btn room-controls__btn--record"
          :class="{ 'is-active': isRecording }"
          type="button"
          :disabled="controlsDisabled || recordPending"
          :aria-pressed="isRecording"
          @click="toggleRecording"
        >
          <span class="room-controls__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="7" />
              <rect v-if="isRecording" x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span class="room-controls__label">{{ isRecording ? '停止录制' : '录制' }}</span>
        </button>

        <button
          class="room-controls__btn room-controls__btn--hangup"
          type="button"
          :disabled="controlsDisabled"
          @click="endVisible = true"
        >
          <span class="room-controls__icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7 4l3 3-2 2a11 11 0 0 0 5 5l2-2 3 3-2 2a2 2 0 0 1-2.4.4A16 16 0 0 1 4.6 7.4 2 2 0 0 1 5 5z" />
            </svg>
          </span>
          <span class="room-controls__label">结束会诊</span>
        </button>
      </footer>
    </template>

    <!-- R13 录制合规提示：本次会话只弹一次，关闭即视为已知悉 -->
    <el-dialog
      v-model="recordingNoticeVisible"
      title="录制提示"
      width="420px"
      append-to-body
      :close-on-click-modal="false"
      @close="acknowledgeRecordingNotice"
    >
      <p class="consult-room__notice-text">
        本次会诊将被录制，用于病历留痕与质量复核。继续留在会场即视为同意录制。
      </p>
      <template #footer>
        <el-button type="primary" @click="acknowledgeRecordingNotice">我知道了</el-button>
      </template>
    </el-dialog>

    <RoomEndDialog
      v-if="room"
      v-model:visible="endVisible"
      :room="room"
      :consultation-id="consultationId"
      @ended="handleEnded"
    />
  </div>
</template>

<style scoped>
/* ---------------------------------------------------------------- 骨架 */

.consult-room {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 520px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
}

.consult-room__skeleton,
.consult-room__error {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xl);
}

.consult-room__skeleton {
  display: block;
  padding: var(--spacing-xl);
}

/* ---------------------------------------------------------------- 顶部信息条 */

.consult-room__topbar {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm) var(--spacing-lg);
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-bg-container);
}

.consult-room__identity,
.consult-room__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 会场号是这一屏唯一的「坐标」，用等宽字体让它从周围文字里立起来 */
.consult-room__room-no {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--font-size-base);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-text-primary);
}

.consult-room__order-no {
  color: var(--color-text-secondary);
}

.consult-room__divider {
  color: var(--color-text-disabled);
}

.consult-room__duration strong {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text-primary);
}

.consult-room__recording {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  color: var(--status-danger);
}

.consult-room__recording--idle {
  font-weight: 400;
  color: var(--color-text-tertiary);
}

/* 录制红点：呼吸式闪烁，静止的红点在余光里等于不存在 */
.consult-room__recording-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--status-danger);
  animation: consult-room-blink 1.2s ease-in-out infinite;
}

@keyframes consult-room-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.2;
  }
}

.consult-room__network {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.consult-room__network-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--status-active);
}

.consult-room__network--fair {
  color: var(--status-warning);
}

.consult-room__network--fair .consult-room__network-dot {
  background: var(--status-warning);
}

.consult-room__network--offline {
  color: var(--status-warning);
}

.consult-room__network--offline .consult-room__network-dot {
  background: var(--status-warning);
}

/* 视频已连接：与网络态用同一个绿点语言，但文案独立——「网通」不等于「P2P 通」 */
.consult-room__rtc-connected {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--status-active);
}

.consult-room__rtc-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--status-active);
}

.consult-room__unstable {  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--status-warning) 14%, var(--color-bg-container));
  color: var(--status-warning);
  font-size: var(--font-size-xs);
}

/* ---------------------------------------------------------------- 主区 */

.consult-room__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.consult-room__stage {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  /* 会议类界面惯例：画面区压暗，让头像与状态标签成为唯一亮点（不用裸 hex，用 rgb 表达深色） */
  background: rgb(15 17 21);
}

.consult-room__sidebar {
  flex: 0 0 320px;
  min-width: 0;
  border-left: 1px solid var(--color-border-light);
  background: var(--color-bg-container);
}

/* ---------------------------------------------------------------- 远端主画面 */

.consult-room__remote {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  background:
    radial-gradient(
      120% 100% at 50% 0%,
      color-mix(in srgb, var(--color-primary) 20%, transparent),
      transparent 62%
    ),
    rgb(15 17 21);
}

.consult-room__remote--left {
  background: rgb(28 30 34);
}

.consult-room__remote-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.consult-room__avatar {
  display: grid;
  place-items: center;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-primary), var(--status-pending-sign));
  color: var(--color-text-inverse);
  font-weight: 600;
  user-select: none;
}

.consult-room__avatar--lg {
  width: 96px;
  height: 96px;
  font-size: 34px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
}

.consult-room__avatar--sm {
  width: 40px;
  height: 40px;
  font-size: 16px;
}

.consult-room__remote-name {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 500;
  color: var(--color-text-inverse);
}

.consult-room__remote-presence {
  margin: 0;
  font-size: var(--font-size-sm);
}

.consult-room__remote-empty {
  margin: 0;
  font-size: var(--font-size-base);
  color: rgba(255, 255, 255, 0.6);
}

/* 连接中/连接失败：放在占位下方而不是盖满全屏，断线时头像和姓名仍然可读 */
.consult-room__rtc-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  color: var(--color-text-inverse);
  text-align: center;
}

.consult-room__rtc-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.78);
}

.consult-room__rtc-sub {
  max-width: 320px;
  margin: 0;
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.56);
}

/* 角色标签浮在右上角：不抢画面中心，但一眼能看出谁是发言人 */
.consult-room__role-tag {
  position: absolute;
  top: var(--spacing-lg);
  right: var(--spacing-lg);
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.92);
  font-size: var(--font-size-xs);
  backdrop-filter: blur(4px);
}

.consult-room__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  background: rgba(0, 0, 0, 0.62);
  color: var(--color-text-inverse);
  z-index: 3;
}

.consult-room__overlay--left {
  background: rgba(0, 0, 0, 0.72);
}

/* 遮罩里的头像压暗 + 去色：传达「人还在，但画面暂时不可用」 */
.consult-room__overlay-avatar {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-primary), var(--status-pending-sign));
  color: var(--color-text-inverse);
  font-size: 34px;
  font-weight: 600;
  opacity: 0.45;
  filter: grayscale(0.6);
  user-select: none;
}

.consult-room__overlay-text {
  margin: 0;
  font-size: var(--font-size-base);
}

.consult-room__spinner {
  width: 32px;
  height: 32px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: var(--color-text-inverse);
  border-radius: var(--radius-full);
  animation: consult-room-spin 0.9s linear infinite;
}

@keyframes consult-room-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------------------------------------------------------------- 影像共享占位 */

.consult-room__share {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgb(22 24 28);
  /* 灰色网格：明确「这是一块待接入的画布」，而不是加载失败的白屏 */
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 32px 32px;
}

.consult-room__share-badge {
  position: absolute;
  top: var(--spacing-lg);
  left: var(--spacing-lg);
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-primary) 24%, transparent);
  color: var(--color-text-inverse);
  font-size: var(--font-size-xs);
}

.consult-room__share-center {
  padding: var(--spacing-xl) var(--spacing-2xl);
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.4);
  text-align: center;
}

.consult-room__share-title {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-lg);
  color: var(--color-text-inverse);
}

.consult-room__share-desc {
  margin: 0;
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.62);
}

/* ---------------------------------------------------------------- 本地小窗 */

.consult-room__local {
  position: absolute;
  right: var(--spacing-lg);
  bottom: var(--spacing-lg);
  z-index: 4;
  width: 240px;
  height: 135px;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: var(--radius-md);
  background: rgb(23 25 30);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  transition: border-color 0.2s, transform 0.2s;
}

.consult-room__local:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
}

.consult-room__local-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.consult-room__local-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  width: 100%;
  height: 100%;
}

.consult-room__local-hint {
  max-width: 200px;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.72);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.consult-room__local-label {
  position: absolute;
  left: var(--spacing-sm);
  bottom: var(--spacing-sm);
  max-width: 200px;
  padding: 2px 8px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: rgba(0, 0, 0, 0.55);
  color: var(--color-text-inverse);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------------------------------------------------------- 会场已结束 */

.consult-room__closed {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xl);
  background: rgba(0, 0, 0, 0.72);
  color: var(--color-text-inverse);
  text-align: center;
}

.consult-room__closed-title {
  margin: 0;
  font-size: var(--font-size-xl);
}

.consult-room__closed-desc {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.68);
}

/* ---------------------------------------------------------------- 底部控制条 */

.consult-room__controls {
  position: relative;
  display: flex;
  flex: 0 0 88px;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2xl);
  border-top: 1px solid var(--color-border-light);
  background: var(--color-bg-container);
}

.room-controls__btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: color 0.2s;
}

.room-controls__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--color-bg-hover);
  transition: background 0.2s, transform 0.12s;
}

.room-controls__btn:hover:not(:disabled) {
  color: var(--color-primary);
}

.room-controls__btn:hover:not(:disabled) .room-controls__icon {
  background: var(--color-bg-active);
}

.room-controls__btn:active:not(:disabled) .room-controls__icon {
  transform: scale(0.94);
}

/* 关闭态（静音 / 关摄像头 / 录制中）统一用危险色：一眼扫过去就知道哪一项正在生效 */
.room-controls__btn.is-active {
  color: var(--status-danger);
}

.room-controls__btn.is-active .room-controls__icon {
  background: color-mix(in srgb, var(--status-danger) 14%, var(--color-bg-container));
  color: var(--status-danger);
}

/* 共享影像是「打开了一个能力」而不是「关掉了什么」，用主色区分 */
.room-controls__btn.is-sharing {
  color: var(--color-primary);
}

.room-controls__btn.is-sharing .room-controls__icon {
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

.room-controls__btn:disabled {
  color: var(--color-text-disabled);
  cursor: not-allowed;
}

.room-controls__btn:disabled .room-controls__icon {
  background: var(--color-bg-muted);
  color: var(--color-text-disabled);
}

.room-controls__btn--hangup {
  position: absolute;
  right: var(--spacing-xl);
  top: 50%;
  transform: translateY(-50%);
  color: var(--status-danger);
}

.room-controls__btn--hangup .room-controls__icon {
  width: 44px;
  height: 44px;
  background: var(--status-danger);
  color: var(--color-text-inverse);
}

.room-controls__btn--hangup:hover:not(:disabled) {
  color: var(--status-danger);
}

.room-controls__btn--hangup:hover:not(:disabled) .room-controls__icon {
  background: color-mix(in srgb, var(--status-danger) 82%, var(--color-text-primary));
}

/* ---------------------------------------------------------------- 弹窗 */

.consult-room__notice-text {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  line-height: 1.7;
}

/* ---------------------------------------------------------------- 窄屏 */

@media (max-width: 1200px) {
  .consult-room__sidebar {
    flex-basis: 280px;
  }

  .consult-room__local {
    width: 200px;
    height: 112px;
  }
}

@media (max-width: 960px) {
  .consult-room__body {
    flex-direction: column;
  }

  .consult-room__sidebar {
    flex: 0 0 240px;
    border-top: 1px solid var(--color-border-light);
    border-left: none;
  }

  .consult-room__controls {
    gap: var(--spacing-xl);
  }
}
</style>
