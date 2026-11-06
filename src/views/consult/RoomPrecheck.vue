<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { Room } from '@/api/types'
import { ApiError, httpGet } from '@/api/request'
import { fetchRoomByConsultation, joinRoom } from '@/api/room'
import { EmptyState } from '@/components/EmptyState'
import { PageCard } from '@/components/PageCard'

/**
 * 会前设备检测（进会诊室前的最后一道门）。
 *
 * 这一页的价值全在「进会诊室之前就把问题摆到台面上」：
 * 用户第一次在自己电脑上开会，最常见的失败不是不会点按钮，而是进了会诊室才发现
 * 摄像头没授权、麦克风被别的软件占着、扬声器没声音。等进了会诊室再排查，
 * 对面几位专家已经在等了。所以这里把四个设备项 + 一个环境项前置，逐项给出结论和下一步。
 *
 * 另一条硬规则：**检测失败不等于不能入会**。设备项失败只降级（标红 + 按钮改文案），
 * 绝不阻断——把「没摄像头」的用户挡在门外，比让他旁听更糟。
 *
 * 所有 getUserMedia / AudioContext 调用都包了 try/catch：这类 API 的失败是常态
 * （拒绝授权、设备被占用、非安全上下文），任何一项炸掉都不能让页面白屏。
 */

const route = useRoute()
const router = useRouter()

/** 路由参数用 computed：同页切换会诊单时不用重新挂载组件 */
const consultationId = computed(() => String(route.params.id ?? ''))

/**
 * 演示环境没有登录态，参会人固定为本地主持人。
 * 接真实鉴权后这里换成当前用户 id，其余逻辑不用动。
 */
const LOCAL_PARTICIPANT_ID = 'host-local'

/** 检测项错开的间隔：太密看不出「正在检测」，太疏总时长会超过 2 秒 */
const STAGGER_MS = 220
/** 单项最短转圈时长：本地设备检测往往 10ms 就出结果，不留白会像「闪一下什么都没发生」 */
const MIN_SPIN_MS = 300
/** 麦克风采样窗口：要盖住一次呼吸间隔，否则用户刚巧停顿就被判成「没有输入」 */
const MIC_SAMPLE_MS = 1_200
/** 测试音时长（极低音量，只为验证输出通路，不是给用户听的声音） */
const SPEAKER_TONE_MS = 300
/** 音量条格数 */
const METER_SEGMENTS = 20

/** 单项检测结论 */
type ProbeStatus = 'pass' | 'warn' | 'fail'

interface ProbeResult {
  status: ProbeStatus
  detail: string
}

type CheckKey = 'camera' | 'microphone' | 'speaker' | 'network' | 'browser'
/** pending = 还没轮到；checking = 转圈中 */
type CheckStatus = 'pending' | 'checking' | ProbeStatus

interface CheckItem {
  key: CheckKey
  label: string
  status: CheckStatus
  detail: string
}

const CHECK_ORDER: CheckKey[] = ['camera', 'microphone', 'speaker', 'network', 'browser']

const CHECK_LABEL: Record<CheckKey, string> = {
  camera: '摄像头',
  microphone: '麦克风',
  speaker: '扬声器',
  network: '网络',
  browser: '浏览器',
}

const CHECKING_TEXT: Record<CheckKey, string> = {
  camera: '正在请求摄像头权限…',
  microphone: '正在采集麦克风输入…',
  speaker: '正在播放测试音…',
  network: '正在测试网络延迟…',
  browser: '正在检查浏览器能力…',
}

// ---------------------------------------------------------------- 会场数据

const room = ref<Room | null>(null)
const roomLoading = ref(true)
const roomError = ref('')

async function loadRoom(): Promise<void> {
  roomLoading.value = true
  roomError.value = ''
  try {
    room.value = await fetchRoomByConsultation(consultationId.value)
  } catch (error) {
    // 会场信息拿不到就没有 roomId，入会无从谈起：这里必须是阻断态（空态 + 重试），
    // 而不是「先让用户进去再说」——那只会让后端再报一次错。
    roomError.value = error instanceof ApiError ? error.message : '会场信息加载失败，请稍后重试'
  } finally {
    roomLoading.value = false
  }
}

// ---------------------------------------------------------------- 生命周期标记

/** 卸载后所有异步回调都不许再写 ref，否则会在已销毁的组件上触发更新 */
let disposed = false
/** 错开检测用的定时器，卸载时统一清掉 */
let timers: ReturnType<typeof setTimeout>[] = []

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timers.push(timer)
  })
}

// ---------------------------------------------------------------- 摄像头

const videoEl = ref<HTMLVideoElement | null>(null)
const cameraGranted = ref(false)
/** 最近一次请求是否被拒绝/无设备：用来区分占位文案是「没授权」还是「用户自己关了」 */
const cameraDenied = ref(false)
/** 权限弹窗未作答时请求会一直挂着，占位区要如实说「正在请求」，不能谎称「已关闭」 */
const cameraRequesting = ref(false)

let videoStream: MediaStream | null = null

function stopCamera(): void {
  if (videoStream) {
    // 必须逐条 stop：不 stop 的话系统摄像头的指示灯会一直亮，
    // 用户会以为程序还在偷拍——这是会前检测页最不能犯的错。
    videoStream.getTracks().forEach((track) => track.stop())
    videoStream = null
  }
  if (videoEl.value) {
    videoEl.value.srcObject = null
  }
  cameraGranted.value = false
}

/**
 * 请求摄像头并挂到 <video> 上。
 * 返回是否成功——检测项和预览区共用这一次请求，不能各开一路流（部分设备只允许单路独占）。
 */
async function startCamera(): Promise<boolean> {
  stopCamera()
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraDenied.value = true
    return false
  }
  cameraRequesting.value = true
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    if (disposed) {
      stream.getTracks().forEach((track) => track.stop())
      return false
    }
    videoStream = stream
    cameraGranted.value = true
    cameraDenied.value = false
    await nextTick()
    if (videoEl.value) {
      videoEl.value.srcObject = stream
    }
    return true
  } catch {
    // NotAllowedError（拒绝）/ NotFoundError（无设备）/ NotReadableError（被占用）
    // 对用户是同一件事：这条流拿不到。文案不细分，避免把技术名词甩给医生看。
    cameraDenied.value = true
    cameraGranted.value = false
    return false
  } finally {
    cameraRequesting.value = false
  }
}

/**
 * video 元素挂在 v-else-if 分支里，首屏渲染前可能还不存在；
 * 流先到、元素后到是常态，所以补一个监听，谁后到都能接上。
 */
watch(videoEl, (el) => {
  if (el && videoStream) {
    el.srcObject = videoStream
  }
})

async function toggleCamera(): Promise<void> {
  if (cameraGranted.value) {
    stopCamera()
    cameraDenied.value = false
    return
  }
  const ok = await startCamera()
  // 手动开关也要同步检测项，否则右上角写着「通过」、画面却是占位，自相矛盾
  applyResult('camera', cameraProbeResult(ok))
}

/**
 * 占位区三态：请求中 / 被拒绝 / 用户手动关闭。
 * 三者对用户的下一步完全不同（去点允许 / 去改系统设置 / 点开关），
 * 用同一句话糊过去等于没给指引。
 */
const cameraPlaceholder = computed(() => {
  if (cameraRequesting.value) {
    return { title: '正在请求摄像头权限…', hint: '请在浏览器弹窗中点击「允许」', retry: false }
  }
  if (cameraDenied.value) {
    return { title: '摄像头未授权或不可用', hint: '检查系统隐私设置，或在地址栏允许本站使用摄像头', retry: true }
  }
  return { title: '摄像头已关闭', hint: '点击下方开关重新打开预览', retry: false }
})

// ---------------------------------------------------------------- 麦克风

const micGranted = ref(false)
const micMuted = ref(false)
const volume = ref(0)

let audioStream: MediaStream | null = null
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let freqData = new Uint8Array(0)
let meterRaf = 0
/** 采样窗口内的峰值，用于判断「设备在、但一直没声音」 */
let peakVolume = 0
/** 手势恢复监听器的引用：卸载时要摘掉，否则窗口上会留着指向已销毁组件的闭包 */
let gestureHandler: (() => void) | null = null

type AudioContextCtor = typeof AudioContext

function getAudioContextCtor(): AudioContextCtor | null {
  // Safari 老版本只有 webkitAudioContext，演示环境不排除有人用 Safari。
  // 构造函数挂在 window 上但未进 Window 接口声明，只能断言成最小形状取。
  const holder = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return holder.AudioContext ?? holder.webkitAudioContext ?? null
}

function stopMeter(): void {
  if (meterRaf) {
    cancelAnimationFrame(meterRaf)
    meterRaf = 0
  }
  analyser = null
  freqData = new Uint8Array(0)
  volume.value = 0
}

function startMeter(): void {
  stopMeter()
  if (!analyser) return
  freqData = new Uint8Array(analyser.frequencyBinCount)
  const node = analyser
  const tick = (): void => {
    if (disposed || !analyser) return
    node.getByteFrequencyData(freqData)
    let sum = 0
    for (let i = 0; i < freqData.length; i += 1) {
      sum += freqData[i]
    }
    // 96 是实测下来「正常说话」的均值量级：不除一个基准，格子永远只亮一两格
    const next = Math.min(1, sum / freqData.length / 96)
    // 上升快、回落慢：读数才不会随每个音节一闪一闪
    volume.value = next > volume.value ? next : volume.value * 0.82 + next * 0.18
    if (volume.value > peakVolume) {
      peakVolume = volume.value
    }
    meterRaf = requestAnimationFrame(tick)
  }
  meterRaf = requestAnimationFrame(tick)
}

/**
 * 浏览器自动播放策略会把页面加载时创建的 AudioContext 挂成 suspended，
 * 此时 analyser 全读 0，麦克风会被误判成「没输入」。
 * 补一次用户手势后的 resume：任意一次点击之后音量条就能正常跳动。
 */
function resumeAudioOnGesture(): void {
  if (gestureHandler) return
  const handler = (): void => {
    if (audioCtx && audioCtx.state === 'suspended') {
      void audioCtx.resume().catch(() => undefined)
    }
  }
  gestureHandler = handler
  window.addEventListener('pointerdown', handler, { once: true })
}

async function startMic(): Promise<boolean> {
  stopMic()
  if (!navigator.mediaDevices?.getUserMedia) {
    return false
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    if (disposed) {
      stream.getTracks().forEach((track) => track.stop())
      return false
    }
    audioStream = stream
    const Ctor = getAudioContextCtor()
    if (!Ctor) {
      // 设备是有的，只是画不出音量条；不能因此判失败
      micGranted.value = true
      return true
    }
    audioCtx = new Ctor()
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => undefined)
    }
    const source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.6
    // 只接 analyser，不接 destination：接出去就是自己听自己的啸叫
    source.connect(analyser)
    micGranted.value = true
    micMuted.value = false
    startMeter()
    resumeAudioOnGesture()
    return true
  } catch {
    micGranted.value = false
    return false
  }
}

function stopMic(): void {
  stopMeter()
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop())
    audioStream = null
  }
  if (audioCtx) {
    void audioCtx.close().catch(() => undefined)
    audioCtx = null
  }
  micGranted.value = false
}

function toggleMic(): void {
  if (!micGranted.value) {
    void startMic().then((ok) => {
      if (!ok) {
        ElMessage.error('麦克风不可用，将无法发言')
      }
    })
    return
  }
  const track = audioStream?.getAudioTracks()[0]
  if (!track) return
  // 用 enabled 而不是 stop：关麦要能一键开回来，重新申请设备会再弹一次权限、体验更差
  track.enabled = micMuted.value
  micMuted.value = !micMuted.value
}

// ---------------------------------------------------------------- 检测项编排

const checks = ref<CheckItem[]>(
  CHECK_ORDER.map((key) => ({ key, label: CHECK_LABEL[key], status: 'pending', detail: '等待检测' })),
)

function findCheck(key: CheckKey): CheckItem | undefined {
  return checks.value.find((item) => item.key === key)
}

function applyResult(key: CheckKey, result: ProbeResult): void {
  const item = findCheck(key)
  if (!item) return
  item.status = result.status
  item.detail = result.detail
}

function cameraProbeResult(ok: boolean): ProbeResult {
  return ok
    ? { status: 'pass', detail: '画面正常，可以入会' }
    : { status: 'fail', detail: '未授权或设备被占用，可仅观看' }
}

async function probeCamera(): Promise<ProbeResult> {
  const ok = await startCamera()
  return cameraProbeResult(ok)
}

async function probeMicrophone(): Promise<ProbeResult> {
  peakVolume = 0
  const ok = await startMic()
  if (!ok) {
    return { status: 'fail', detail: '未授权或设备被占用，将无法发言' }
  }
  await wait(MIC_SAMPLE_MS)
  if (peakVolume < 0.02) {
    // 设备在、但没采到声音：多数是系统输入选错了或设备静音。
    // 判 warn 而不是 fail —— 用户可能只是没说话，不能因此把他挡在门外。
    return { status: 'warn', detail: '未检测到输入，请检查设备' }
  }
  return { status: 'pass', detail: '已检测到输入，音量正常' }
}

async function probeSpeaker(): Promise<ProbeResult> {
  const Ctor = getAudioContextCtor()
  if (!Ctor) {
    return { status: 'fail', detail: '音频输出不可用' }
  }
  let ctx: AudioContext | null = null
  try {
    ctx = new Ctor()
    if (ctx.state === 'suspended') {
      // 点「重试」时这次调用处在用户手势里，能 resume 成功
      await ctx.resume().catch(() => undefined)
    }
    if (ctx.state !== 'running') {
      return { status: 'warn', detail: '浏览器暂未允许播放测试音，点「重试」再测一次' }
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    // 音量压到几乎听不见：验证的是输出通路，不是打扰用户
    gain.gain.value = 0.02
    osc.frequency.value = 440
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    await wait(SPEAKER_TONE_MS)
    osc.stop()
    return { status: 'pass', detail: '音频输出正常' }
  } catch {
    return { status: 'fail', detail: '音频输出不可用' }
  } finally {
    if (ctx) {
      void ctx.close().catch(() => undefined)
    }
  }
}

/** 浏览器 Network Information API 尚未进 lib.dom，本地补一个最小形状 */
interface NetworkInformationLike {
  effectiveType?: string
}

/** 延迟阈值：300ms 内是「无感」，800ms 内还能开会，再高就会出现明显对不上嘴 */
const RTT_GOOD_MS = 300
const RTT_FAIR_MS = 800

async function probeNetwork(): Promise<ProbeResult> {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
  const effectiveType = connection?.effectiveType ?? ''

  const startedAt = performance.now()
  let rtt = -1
  try {
    // 走请求层而不是裸 fetch：mock 开启时只有这条路能通，
    // 而且量到的是「页面真实要走的链路」，比测 CDN 更有意义。
    await httpGet('/dictionaries')
    rtt = performance.now() - startedAt
  } catch {
    rtt = -1
  }

  if (rtt >= 0) {
    if (rtt < RTT_GOOD_MS) return { status: 'pass', detail: `延迟 ${Math.round(rtt)}ms，网络良好` }
    if (rtt < RTT_FAIR_MS) return { status: 'pass', detail: `延迟 ${Math.round(rtt)}ms，网络一般` }
    return { status: 'warn', detail: '网络不稳定，可能影响画面' }
  }

  // 探测失败时用网络类型兜底：2g/slow-2g 基本可以确定撑不住视频
  if (effectiveType === 'slow-2g' || effectiveType === '2g') {
    return { status: 'warn', detail: '网络不稳定，可能影响画面' }
  }
  if (effectiveType) {
    return { status: 'pass', detail: `当前网络 ${effectiveType.toUpperCase()}，延迟未测到` }
  }
  // 两种手段都拿不到结论：给 warn 而不是 fail —— 后端接口挂了不等于用户的网不好
  return { status: 'warn', detail: '网络不稳定，可能影响画面' }
}

async function probeBrowser(): Promise<ProbeResult> {
  const missing: string[] = []
  if (!navigator.mediaDevices?.getUserMedia) missing.push('摄像头/麦克风采集')
  if (typeof window.RTCPeerConnection !== 'function') missing.push('WebRTC')
  if (typeof window.WebGLRenderingContext === 'undefined') missing.push('WebGL')
  if (missing.length) {
    return { status: 'fail', detail: `缺少 ${missing.join('、')}，建议使用 Chrome / Edge 最新版` }
  }
  return { status: 'pass', detail: '浏览器能力完备' }
}

function probeFor(key: CheckKey): Promise<ProbeResult> {
  switch (key) {
    case 'camera':
      return probeCamera()
    case 'microphone':
      return probeMicrophone()
    case 'speaker':
      return probeSpeaker()
    case 'network':
      return probeNetwork()
    case 'browser':
      return probeBrowser()
  }
}

/**
 * 跑单项检测。
 * 结果与「最短转圈时长」一起等：设备检测本身几乎瞬时，
 * 不垫一点时间的话用户只看到状态从灰直接变绿，会觉得「根本没检测」。
 */
async function runCheck(key: CheckKey): Promise<void> {
  const item = findCheck(key)
  if (!item) return
  item.status = 'checking'
  item.detail = CHECKING_TEXT[key]
  try {
    const [result] = await Promise.all([probeFor(key), wait(MIN_SPIN_MS)])
    if (disposed) return
    item.status = result.status
    item.detail = result.detail
  } catch {
    if (disposed) return
    // 兜底：probe 内部已经各自 try/catch，走到这里说明是意料外的异常，
    // 也不能让某一项永远停在转圈上
    item.status = 'fail'
    item.detail = '检测异常，可重试'
  }
}

/** 依次错开启动：0/220/440/660/880ms，全部在 1.2 秒左右出结果 */
function runAllChecks(): void {
  timers.forEach((timer) => clearTimeout(timer))
  timers = []
  checks.value.forEach((item) => {
    item.status = 'pending'
    item.detail = '等待检测'
  })
  CHECK_ORDER.forEach((key, index) => {
    const timer = setTimeout(() => {
      void runCheck(key)
    }, index * STAGGER_MS)
    timers.push(timer)
  })
}

const summary = computed(() => {
  const list = checks.value
  const done = list.filter((item) => item.status === 'pass' || item.status === 'warn' || item.status === 'fail')
  if (done.length < list.length) {
    return `正在检测 ${done.length}/${list.length}`
  }
  const pass = list.filter((item) => item.status === 'pass').length
  const warn = list.filter((item) => item.status === 'warn').length
  const fail = list.filter((item) => item.status === 'fail').length
  return `${pass} 项通过 / ${warn} 项警告 / ${fail} 项失败`
})

function checkClassOf(item: CheckItem): Record<string, boolean> {
  return {
    'room-precheck__check--pass': item.status === 'pass',
    'room-precheck__check--fail': item.status === 'fail',
    'room-precheck__check--warn': item.status === 'warn',
    'room-precheck__check--checking': item.status === 'checking',
  }
}

/** 浏览器能力是既成事实，重试没有意义；其余三项重试可能真的修好（插上设备、点允许） */
function canRetry(item: CheckItem): boolean {
  return (item.status === 'fail' || item.status === 'warn') && item.key !== 'browser'
}

// ---------------------------------------------------------------- 音量条

const litSegments = computed(() => Math.round(volume.value * METER_SEGMENTS))

const micText = computed(() => {
  if (!micGranted.value) return '麦克风不可用，将无法发言'
  if (micMuted.value) return '已静音'
  return '麦克风已开启'
})

// ---------------------------------------------------------------- 入会

const joining = ref(false)

/** 无摄像头时不阻断，只是把按钮文案改成「旁听」——让用户知道自己会看到什么 */
const joinLabel = computed(() => (cameraGranted.value ? '进入会诊室' : '以旁听身份进入'))

async function handleJoin(): Promise<void> {
  const current = room.value
  if (!current || joining.value) return
  joining.value = true
  try {
    await joinRoom(current.id, { participantId: LOCAL_PARTICIPANT_ID, role: 'HOST' })
    await router.push(`/consult/${consultationId.value}/room`)
  } catch (error) {
    // 人数已满（50002）这类业务失败必须原样透出后端 message，
    // 前端不猜原因——猜错了用户会去改设备，而真正的问题是会场满了
    ElMessage.error(error instanceof ApiError ? error.message : '进入会诊室失败，请稍后重试')
  } finally {
    joining.value = false
  }
}

function handleCancel(): void {
  router.back()
}

// ---------------------------------------------------------------- 生命周期

onMounted(() => {
  // 会场信息与设备检测互不依赖，并行跑：等接口回来再申请权限，用户会白等一次往返
  void loadRoom()
  runAllChecks()
})

onBeforeUnmount(() => {
  disposed = true
  timers.forEach((timer) => clearTimeout(timer))
  timers = []
  if (gestureHandler) {
    window.removeEventListener('pointerdown', gestureHandler)
    gestureHandler = null
  }
  stopCamera()
  stopMic()
})
</script>

<template>
  <section class="room-precheck">
    <el-skeleton v-if="roomLoading" class="room-precheck__skeleton" :rows="6" animated />

    <EmptyState
      v-else-if="roomError || !room"
      type="error"
      title="会场信息加载失败"
      :description="roomError || '未找到对应的会诊会场'"
      action-text="重新加载"
      @action="loadRoom"
    />

    <template v-else>
      <div class="room-precheck__body">
        <PageCard class="room-precheck__main" title="设备预览">
          <template #extra>
            <span class="room-precheck__summary">{{ summary }}</span>
          </template>

          <div class="room-precheck__preview">
            <video
              ref="videoEl"
              class="room-precheck__video"
              :class="{ 'room-precheck__video--hidden': !cameraGranted }"
              autoplay
              muted
              playsinline
            />

            <div v-if="!cameraGranted" class="room-precheck__placeholder">
              <svg class="room-precheck__avatar" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
                <circle cx="32" cy="23" r="11" fill="none" stroke="currentColor" stroke-width="2.5" />
                <path
                  d="M12 54c0-11 9-18 20-18s20 7 20 18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                />
              </svg>
              <p class="room-precheck__placeholder-title">{{ cameraPlaceholder.title }}</p>
              <p class="room-precheck__placeholder-hint">{{ cameraPlaceholder.hint }}</p>
              <button v-if="cameraPlaceholder.retry" class="room-precheck__retry" type="button" @click="toggleCamera">
                重试
              </button>
            </div>

            <div class="room-precheck__overlay">
              <div class="room-precheck__mic">
                <div
                  class="room-precheck__meter"
                  :class="{ 'room-precheck__meter--off': !micGranted || micMuted }"
                  role="img"
                  :aria-label="micText"
                >
                  <span
                    v-for="n in METER_SEGMENTS"
                    :key="n"
                    class="room-precheck__meter-seg"
                    :class="{ 'is-lit': n <= litSegments }"
                  />
                </div>
                <span class="room-precheck__mic-text">{{ micText }}</span>
              </div>

              <div class="room-precheck__toggles">
                <button
                  class="room-precheck__toggle"
                  :class="{ 'is-off': !cameraGranted }"
                  type="button"
                  @click="toggleCamera"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <rect
                      x="2"
                      y="6"
                      width="13"
                      height="12"
                      rx="2.5"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                    />
                    <path d="M15 10.5l6-3.5v10l-6-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                  </svg>
                  <span>{{ cameraGranted ? '关闭摄像头' : '开启摄像头' }}</span>
                </button>

                <button
                  class="room-precheck__toggle"
                  :class="{ 'is-off': !micGranted || micMuted }"
                  type="button"
                  @click="toggleMic"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <rect
                      x="9"
                      y="3"
                      width="6"
                      height="11"
                      rx="3"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                    />
                    <path d="M5 11a7 7 0 0014 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <path d="M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                  </svg>
                  <span>{{ !micGranted ? '开启麦克风' : micMuted ? '取消静音' : '静音' }}</span>
                </button>
              </div>
            </div>
          </div>
        </PageCard>

        <aside class="room-precheck__aside">
          <PageCard title="检测项">
            <ul class="room-precheck__checks">
              <li
                v-for="item in checks"
                :key="item.key"
                class="room-precheck__check"
                :class="checkClassOf(item)"
                :data-key="item.key"
              >
                <span class="room-precheck__check-icon" aria-hidden="true">
                  <span v-if="item.status === 'checking'" class="room-precheck__spinner" />
                  <svg v-else-if="item.status === 'pass'" viewBox="0 0 16 16" width="16" height="16">
                    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <svg v-else-if="item.status === 'fail'" viewBox="0 0 16 16" width="16" height="16">
                    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                  <svg v-else-if="item.status === 'warn'" viewBox="0 0 16 16" width="16" height="16">
                    <path d="M8 3v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                    <circle cx="8" cy="12.5" r="1.1" fill="currentColor" />
                  </svg>
                  <span v-else class="room-precheck__dot" />
                </span>

                <div class="room-precheck__check-body">
                  <p class="room-precheck__check-name">{{ item.label }}</p>
                  <p class="room-precheck__check-detail">{{ item.detail }}</p>
                </div>

                <button
                  v-if="canRetry(item)"
                  class="room-precheck__check-retry"
                  type="button"
                  @click="runCheck(item.key)"
                >
                  重试
                </button>
              </li>
            </ul>
          </PageCard>
        </aside>
      </div>

      <footer class="room-precheck__footer">
        <div class="room-precheck__footer-info">
          <span class="room-precheck__room-no">会场号 {{ room.roomNo }}</span>
          <span class="room-precheck__presence">
            当前 {{ room.participants.length }}/{{ room.maxParticipants }} 人在场
          </span>
        </div>

        <div class="room-precheck__footer-actions">
          <!-- 降级必须说清楚：不能只改按钮文案，用户得先知道进去之后会看到什么 -->
          <p v-if="!cameraGranted" class="room-precheck__fallback-tip">无摄像头仍可入会，仅观看画面</p>
          <div class="room-precheck__buttons">
            <el-button class="room-precheck__cancel" @click="handleCancel">取消</el-button>
            <el-button
              class="room-precheck__join"
              type="primary"
              :loading="joining"
              @click="handleJoin"
            >
              {{ joinLabel }}
            </el-button>
          </div>
        </div>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.room-precheck {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.room-precheck__skeleton {
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
}

/* 左大右小：预览是主角，检测项是佐证，主次不能倒过来 */
.room-precheck__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--spacing-lg);
  align-items: start;
}

@media (max-width: 1100px) {
  .room-precheck__body {
    grid-template-columns: minmax(0, 1fr);
  }
}

.room-precheck__summary {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* ---------------------------------------------------------------- 预览 */

.room-precheck__preview {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--color-bg-muted), var(--color-bg-hover));
}

.room-precheck__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--color-bg-muted);
}

/* 用 visibility 而不是 v-if：<video> 反复销毁重建会让部分设备重复亮灯 */
.room-precheck__video--hidden {
  visibility: hidden;
}

.room-precheck__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-lg);
  color: var(--color-text-tertiary);
  text-align: center;
}

.room-precheck__avatar {
  color: var(--color-text-disabled);
}

.room-precheck__placeholder-title {
  margin: var(--spacing-xs) 0 0;
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

.room-precheck__placeholder-hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.room-precheck__retry {
  margin-top: var(--spacing-sm);
  padding: 0 var(--spacing-lg);
  height: 30px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-container);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.room-precheck__retry:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* 底部一层渐变压暗，保证白色控件在任何画面上都读得出来 */
.room-precheck__overlay {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--color-text-primary) 55%, transparent),
    transparent
  );
}

.room-precheck__mic {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 0;
}

.room-precheck__meter {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 16px;
}

.room-precheck__meter-seg {
  width: 4px;
  height: 10px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-bg-container) 30%, transparent);
  transition: background-color 120ms linear;
}

.room-precheck__meter-seg.is-lit {
  background: var(--status-active);
}

/* 麦克风不可用或已静音：整条置灰，避免「有格子亮着」被误读成还能说话 */
.room-precheck__meter--off .room-precheck__meter-seg {
  background: var(--color-text-tertiary);
}

.room-precheck__mic-text {
  font-size: var(--font-size-xs);
  color: var(--color-bg-container);
}

.room-precheck__toggles {
  display: flex;
  gap: var(--spacing-sm);
}

.room-precheck__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  border: 1px solid color-mix(in srgb, var(--color-bg-container) 40%, transparent);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-text-primary) 45%, transparent);
  color: var(--color-bg-container);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.room-precheck__toggle:hover {
  background: color-mix(in srgb, var(--color-text-primary) 65%, transparent);
}

.room-precheck__toggle.is-off {
  color: color-mix(in srgb, var(--color-bg-container) 70%, transparent);
}

/* ---------------------------------------------------------------- 检测项 */

.room-precheck__checks {
  margin: 0;
  padding: 0;
  list-style: none;
}

.room-precheck__check {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--spacing-sm) var(--spacing-md);
  padding: var(--spacing-md) 0;
  border-bottom: 1px solid var(--color-border-light);
}

.room-precheck__check:first-child {
  padding-top: 0;
}

.room-precheck__check:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.room-precheck__check-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--color-text-disabled);
}

.room-precheck__check--pass .room-precheck__check-icon {
  color: var(--status-active);
}

.room-precheck__check--fail .room-precheck__check-icon {
  color: var(--status-danger);
}

.room-precheck__check--warn .room-precheck__check-icon {
  color: var(--status-warning);
}

.room-precheck__check--checking .room-precheck__check-icon {
  color: var(--color-primary);
}

.room-precheck__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: currentColor;
}

.room-precheck__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-full);
  animation: room-precheck-spin 700ms linear infinite;
}

@keyframes room-precheck-spin {
  to {
    transform: rotate(360deg);
  }
}

.room-precheck__check-body {
  min-width: 0;
}

.room-precheck__check-name {
  margin: 0;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.room-precheck__check--pass .room-precheck__check-name {
  color: var(--color-text-secondary);
}

.room-precheck__check-detail {
  margin: 2px 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  word-break: break-word;
}

.room-precheck__check--fail .room-precheck__check-detail {
  color: var(--status-danger);
}

.room-precheck__check--warn .room-precheck__check-detail {
  color: var(--status-warning);
}

.room-precheck__check-retry {
  padding: 0 var(--spacing-sm);
  height: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-container);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.room-precheck__check-retry:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* ---------------------------------------------------------------- 底栏 */

.room-precheck__footer {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
  box-shadow: var(--shadow-md);
}

.room-precheck__footer-info {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--spacing-lg);
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

.room-precheck__room-no {
  font-weight: 600;
  color: var(--color-text-primary);
}

.room-precheck__footer-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--spacing-xs);
}

.room-precheck__fallback-tip {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.room-precheck__buttons {
  display: flex;
  gap: var(--spacing-sm);
}

/* 主按钮跟令牌走：Element Plus 默认蓝不是本仓主色 */
.room-precheck__join.el-button--primary {
  --el-button-bg-color: var(--color-primary);
  --el-button-border-color: var(--color-primary);
  --el-button-hover-bg-color: var(--color-primary-hover);
  --el-button-hover-border-color: var(--color-primary-hover);
  --el-button-active-bg-color: var(--color-primary);
  --el-button-active-border-color: var(--color-primary);
}
</style>
