import { onScopeDispose, ref } from 'vue'
import type { Ref } from 'vue'

/**
 * 会诊室的原生 WebRTC 直连（A 档）。
 *
 * 为什么不用 simple-peer / peerjs：会场只需要「两方点对点」，一旦引入库，
 * 多出来的信令封装、默认 STUN 列表、以及库自己的一套状态机，反而会把
 * 「谁发 offer、谁答 offer」这条唯一重要的规则藏起来，联调时无从下手。
 * 这里手写的量不到 300 行，出问题能一眼看到是 ICE 没通还是信令没送到。
 *
 * 三条硬约定（与服务端信令协议同源）：
 * 1. **不在 composable 里做业务判断**。它只负责「连上、给出流、报状态」；
 *    能不能开会、谁该被移出会场，全部留在页面与接口层。
 * 2. **失败必须降级而不是抛错**。没有摄像头、拒绝授权、服务端没起，
 *    页面都应该还能进——旁听一场也比白屏强。
 * 3. **清理是幂等的**。页面卸载、轮询发现会场已关闭、用户点重连，
 *    都可能调用 hangup()，任一次都不许留下亮着的摄像头灯或悬挂的 SSE。
 */

export type RtcState = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed'

export interface UseRtcOptions {
  /** 会诊单 id，作为信令 roomId */
  roomId: () => string | null
  /** 请求远端画面时是否同时要音频，默认 true */
  wantAudio?: boolean
}

export interface UseRtcReturn {
  /** 本地流（含音视频轨；无摄像头时只有音频或为 null） */
  localStream: Ref<MediaStream | null>
  /** 远端流 */
  remoteStream: Ref<MediaStream | null>
  /** 远端参会方 id，null 表示还没人 */
  remoteId: Ref<string | null>
  /** 连接状态 */
  state: Ref<RtcState>
  /** 最近一次错误，供页面提示 */
  error: Ref<string | null>
  /** 本地媒体轨开关（不重建连接，只改 track.enabled） */
  setLocalAudioEnabled: (on: boolean) => void
  setLocalVideoEnabled: (on: boolean) => void
  /** 手动挂断 / 重连 */
  hangup: () => void
  reconnect: () => Promise<void>
}

type SignalType = 'offer' | 'answer' | 'ice'

/** 服务端 signal 事件的数据体 */
interface SignalMessage {
  from: string
  type: SignalType
  payload: unknown
}

interface ReadyMessage {
  selfId: string
  roomId: string
  peers: string[]
}

interface PresenceMessage {
  from: string
  at?: string
}

/**
 * 信令同源前缀，由 vite proxy 转到 3000。
 * 必须用原生 fetch / EventSource：src/api/request.ts 上挂了 mock adapter，
 * axios 出去的请求会被 mock 截走，拿不到真服务端的 SSE 与投递结果。
 */
const SIGNAL_ENDPOINT = '/api/rtc/signal'

/**
 * 唯一的 ICE server。
 * A 档只承诺同机 / 同局域网直连，STUN 只是为了在「有公网映射」时也能打通；
 * 不带 TURN，跨对称 NAT 必然连不上——媒体中继是 B/C 档补的能力，这里不假装有。
 */
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

/** getUserMedia 的失败原因要翻成人话：用户看到的不能是 DOMException 名字 */
function describeMediaError(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '摄像头/麦克风权限被拒绝，当前只能接收对方画面'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return '未检测到摄像头或麦克风，当前只能接收对方画面'
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return '摄像头或麦克风被其他程序占用，当前只能接收对方画面'
  }
  return '本地音视频采集失败，当前只能接收对方画面'
}

/** SSE 的 data 是字符串，解析失败只可能是服务端发了非 JSON，按「没有这条消息」处理 */
function parseData<T>(event: Event): T | null {
  if (!(event instanceof MessageEvent)) {
    return null
  }
  try {
    return JSON.parse(String(event.data)) as T
  } catch {
    return null
  }
}

/** 发出 offer 后等多久算「没人应答」：服务端清理掉线连接有延迟，页面不能永远停在连接中 */
const OFFER_TIMEOUT_MS = 10_000

/**
 * 信令 id：每次 useRtc() 生成一次，此后（含 EventSource 自动重连）不再变。
 *
 * 为什么不能用业务身份 'host-local'：服务端按 participantId 建房间成员表（Map<participantId, 连接>），
 * 两个标签页同 id 会互相顶掉，被顶掉的那条连接不报错也不关闭，只是再也收不到帧——
 * 现场表现就是「都进来了、都显示在线、对面永远是黑的」，极难定位。
 * 业务身份仍然固定 'host-local'，只用于会场接口与「你」的标记，不进信令层。
 */
function createSignalId(): string {
  return `host-local-${Math.random().toString(36).slice(2, 8)}`
}

export function useRtc(options: UseRtcOptions): UseRtcReturn {
  const wantAudio = options.wantAudio ?? true
  const signalId = createSignalId()

  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const remoteId = ref<string | null>(null)
  const state = ref<RtcState>('idle')
  const error = ref<string | null>(null)

  let peer: RTCPeerConnection | null = null
  let source: EventSource | null = null
  /** 手动挂断 / 组件卸载后置 true：所有异步回调看到它就立刻退出，不再写 ref、不再发请求 */
  let closed = false
  /** 采集还没回来时防止重复 start（重连按钮连点两下） */
  let starting = false
  /** 远端描述设好之前到达的 candidate 无条件缓存：提前 addIceCandidate 会抛 InvalidStateError */
  let pendingCandidates: RTCIceCandidateInit[] = []
  /** offer 的应答超时；连上/拆连接都要清，避免迟到的定时器把已连好的会话标成失败 */
  let answerTimer: ReturnType<typeof setTimeout> | null = null

  function clearAnswerTimer(): void {
    if (answerTimer) {
      clearTimeout(answerTimer)
      answerTimer = null
    }
  }

  /** 对端可能早已离开、服务端却还留着这条占位连接：超时后必须给出「失败 + 重试」，不能无限转圈 */
  function scheduleAnswerTimeout(targetId: string): void {
    clearAnswerTimer()
    answerTimer = setTimeout(() => {
      answerTimer = null
      if (closed || state.value === 'connected' || remoteId.value !== targetId) {
        return
      }
      error.value = '对方未应答，可能已离开会场'
      state.value = 'failed'
    }, OFFER_TIMEOUT_MS)
  }

  // ------------------------------------------------------------ 信令发送

  async function postSignal(to: string, type: SignalType, payload: unknown): Promise<void> {
    const roomId = options.roomId()
    if (closed || !roomId) {
      return
    }
    try {
      const response = await fetch(SIGNAL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, from: signalId, to, type, payload }),
      })
      if (!response.ok) {
        error.value = `信令发送失败（HTTP ${response.status}），视频可能无法接通`
      }
    } catch {
      // 信令投递失败不等于媒体连接一定失败（对端可能已经拿到 offer），所以只提示不中断
      error.value = '信令发送失败，请确认服务端已启动'
    }
  }

  // ------------------------------------------------------------ 连接本体

  function flushCandidates(connection: RTCPeerConnection): void {
    const buffered = pendingCandidates
    pendingCandidates = []
    for (const candidate of buffered) {
      void connection.addIceCandidate(candidate).catch(() => {
        // 对端撤回或重复投递的 candidate 会 reject；这不是故障，丢掉即可
      })
    }
  }

  /** 拆掉唯一的那路连接，但保留本地流与 SSE（换对端时还会用到） */
  function teardownPeer(): void {
    clearAnswerTimer()
    if (peer) {
      // 先摘回调再 close：close() 会触发 connectionstatechange，
      // 不摘的话「主动挂断」会被误判成一次连接失败，页面弹出假错误。
      peer.onicecandidate = null
      peer.ontrack = null
      peer.onconnectionstatechange = null
      peer.close()
      peer = null
    }
    pendingCandidates = []
    remoteStream.value = null
    remoteId.value = null
  }

  /** 建一条新连接：把本地轨挂进去，没有的轨用 recvonly 占位，保证对端 offer 能匹配上 */
  function createPeer(): RTCPeerConnection {
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const stream = localStream.value
    const videoTrack = stream?.getVideoTracks()[0] ?? null
    const audioTrack = stream?.getAudioTracks()[0] ?? null

    if (stream && videoTrack) {
      connection.addTrack(videoTrack, stream)
    } else {
      // 没有摄像头也要能看见对方：占一个只收的收发器，
      // 否则远端 offer 里的视频 m-line 在这边找不到对应项，直接协商失败。
      connection.addTransceiver('video', { direction: 'recvonly' })
    }

    if (stream && audioTrack) {
      connection.addTrack(audioTrack, stream)
    } else if (wantAudio) {
      connection.addTransceiver('audio', { direction: 'recvonly' })
    }

    connection.onicecandidate = (event) => {
      if (closed || !event.candidate || !remoteId.value) {
        return
      }
      void postSignal(remoteId.value, 'ice', event.candidate.toJSON())
    }

    connection.ontrack = (event) => {
      // 绝大多数情况下同一条流的所有轨都在 event.streams[0] 里；
      // 直接用这个流而不是自己拼，页面拿到的就是同一个 MediaStream 实例，切 srcObject 不会黑屏闪一下。
      const inbound = event.streams[0]
      if (inbound) {
        remoteStream.value = inbound
        return
      }
      const merged = new MediaStream([...(remoteStream.value?.getTracks() ?? []), event.track])
      remoteStream.value = merged
    }

    connection.onconnectionstatechange = () => {
      if (closed || connection !== peer) {
        return
      }
      switch (connection.connectionState) {
        case 'connected':
          clearAnswerTimer()
          state.value = 'connected'
          error.value = null
          break
        case 'disconnected':
          // 切网络时常见，浏览器会自己尝试恢复；先按「建立中」显示，别急着报失败
          state.value = 'connecting'
          break
        case 'failed':
          state.value = 'failed'
          error.value = '视频连接失败，双方网络可能无法直连'
          break
        default:
          break
      }
    }

    return connection
  }

  /** 取对端连接；换成另一个人时替换掉旧的（A 档只承载 2 方） */
  function ensurePeer(nextRemoteId: string): RTCPeerConnection {
    if (peer && remoteId.value === nextRemoteId) {
      return peer
    }
    if (peer) {
      error.value = '会场仅支持 2 方视频，已与最新加入方建立连接'
      teardownPeer()
    }
    remoteId.value = nextRemoteId
    peer = createPeer()
    return peer
  }

  // ------------------------------------------------------------ 协商

  async function sendOffer(targetId: string): Promise<void> {
    const connection = ensurePeer(targetId)
    /*
     * 协商已经进行中就别再发：刷新页面时旧连接常常还没断，新连接一收到 ready 就抢着 offer，
     * 双方同时发就会 glare（setRemoteDescription 撞在 have-local-offer 上直接失败）。
     * 只由 stable 态发起，另一方的 offer 会被 handleOffer 正常应答。
     */
    if (connection.signalingState !== 'stable') {
      return
    }
    try {
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      await postSignal(targetId, 'offer', offer)
      scheduleAnswerTimeout(targetId)
    } catch {
      error.value = '发起视频协商失败'
      state.value = 'failed'
    }
  }

  async function handleOffer(message: SignalMessage): Promise<void> {
    // 对方主动找上来就说明有人活着：之前那次「等应答」的计时立刻作废
    clearAnswerTimer()
    // 已经有对端且不是他：直接让新人顶掉旧的，不排队不协商——2 方上限就该这么硬
    if (peer && remoteId.value && remoteId.value !== message.from) {
      error.value = '会场仅支持 2 方视频，已与最新加入方建立连接'
      teardownPeer()
    }
    state.value = 'connecting'
    const connection = ensurePeer(message.from)
    try {
      await connection.setRemoteDescription(message.payload as RTCSessionDescriptionInit)
      flushCandidates(connection)
      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      await postSignal(message.from, 'answer', answer)
    } catch {
      error.value = '应答视频协商失败'
      state.value = 'failed'
    }
  }

  async function handleAnswer(message: SignalMessage): Promise<void> {
    // 没发过 offer 就收到的 answer 属于串台（例如旧连接迟到的回包），忽略比抛错安全
    if (!peer || remoteId.value !== message.from) {
      return
    }
    try {
      await peer.setRemoteDescription(message.payload as RTCSessionDescriptionInit)
      flushCandidates(peer)
    } catch {
      error.value = '处理视频应答失败'
      state.value = 'failed'
    }
  }

  async function handleIce(message: SignalMessage): Promise<void> {
    const candidate = message.payload as RTCIceCandidateInit | null
    if (!candidate || !candidate.candidate) {
      return
    }
    if (!peer) {
      // 还没开始协商：candidate 没有落点，留着也匹配不上，直接丢
      return
    }
    if (!peer.remoteDescription) {
      pendingCandidates.push(candidate)
      return
    }
    try {
      await peer.addIceCandidate(candidate)
    } catch {
      // 同上：重复或过期的 candidate 不是故障
    }
  }

  // ------------------------------------------------------------ 信令接收

  function handleReady(message: ReadyMessage): void {
    error.value = null
    /*
     * 拓扑约定：后进的人遍历 peers 主动发起，先进的人只等着应答。
     * 这里仍然按 selfId 过滤一遍：信令身份已经做到「每标签页唯一」，
     * 若服务端把本连接也列进 peers（例如回显了自己的 id），照发 offer 会变成自己连自己。
     *
     * 取**最后一个**而不是第一个：peers 按加入顺序排，最后一个是最新进来的人，最可能还活着。
     * 服务端清理掉线连接有延迟（要等下一个 ping 写失败才发现），列表头部常常是「已关闭的标签页」，
     * 拿它发 offer 会一直打不通——这正是同机反复开关节签页时最容易踩的坑。
     */
    const candidates = message.peers.filter((id) => id !== signalId)
    const targetId = candidates[candidates.length - 1] ?? null
    if (!targetId) {
      // 房间里只有自己：空场，等对方进来（对方会发 offer，我们不应主动探）
      if (!remoteId.value) {
        state.value = 'idle'
        error.value = null
      }
      return
    }
    // SSE 断线重连后服务端会重发 ready，此时连接可能已经建好，不能再发一次 offer
    if (remoteId.value === targetId && peer?.currentRemoteDescription) {
      return
    }
    state.value = 'connecting'
    void sendOffer(targetId)
  }

  function openStream(): void {
    const roomId = options.roomId()
    if (closed) {
      return
    }
    if (!roomId) {
      // 路由还没给出会诊单号：不报错，等页面拿到 id 后由 reconnect() 补
      state.value = 'idle'
      return
    }

    const url = `${SIGNAL_ENDPOINT}/stream?roomId=${encodeURIComponent(roomId)}&participantId=${encodeURIComponent(signalId)}`
    const eventSource = new EventSource(url)
    source = eventSource

    eventSource.addEventListener('ready', (event) => {
      const message = parseData<ReadyMessage>(event)
      if (message && !closed) {
        handleReady(message)
      }
    })

    eventSource.addEventListener('peer-joined', () => {
      // 先进的一方不发 offer，只把状态翻成「等对方来连」，让界面别停在「空场」文案上
      if (!closed && !remoteId.value) {
        state.value = 'connecting'
      }
    })

    eventSource.addEventListener('peer-left', (event) => {
      const message = parseData<PresenceMessage>(event)
      if (!message || closed) {
        return
      }
      // 只处理当前对端离开：别人进出不影响这唯一一路视频
      if (remoteId.value === null || message.from === remoteId.value) {
        teardownPeer()
        state.value = 'idle'
        error.value = null
      }
    })

    eventSource.addEventListener('signal', (event) => {
      const message = parseData<SignalMessage>(event)
      if (!message || closed) {
        return
      }
      if (message.type === 'offer') {
        void handleOffer(message)
      } else if (message.type === 'answer') {
        void handleAnswer(message)
      } else {
        void handleIce(message)
      }
    })

    eventSource.onerror = () => {
      if (closed) {
        return
      }
      // EventSource 会自己重连（ready 会重发，handleReady 有去重）；连不上时先把话说清楚
      error.value = '信令连接失败，请确认服务端已启动'
      if (state.value !== 'connected') {
        state.value = 'failed'
      }
    }
  }

  // ------------------------------------------------------------ 本地媒体

  async function acquireLocalStream(): Promise<MediaStream | null> {
    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = '当前浏览器不支持音视频采集，只能接收对方画面'
      return null
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: wantAudio })
    } catch (cause) {
      // 无设备 / 拒绝授权 / 被占用都是常态：降级成「只收不发」，不阻断入会
      error.value = describeMediaError(cause)
      return null
    }
  }

  function setTrackEnabled(kind: 'audio' | 'video', on: boolean): void {
    const stream = localStream.value
    if (!stream) {
      return
    }
    const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks()
    for (const track of tracks) {
      // 只改 enabled，不 removeTrack：摘轨会触发重新协商，还会让摄像头指示灯闪断
      track.enabled = on
    }
  }

  function stopLocalTracks(): void {
    localStream.value?.getTracks().forEach((track) => track.stop())
    localStream.value = null
  }

  // ------------------------------------------------------------ 生命周期

  async function start(): Promise<void> {
    if (closed || starting) {
      return
    }
    starting = true
    state.value = 'connecting'
    error.value = null
    try {
      // 先拿本地流再开 SSE：拿到流之前开流的话，peer-joined 一响对端就会发 offer，
      // 而这边 offer/answer 里还没有任何本地轨，观感上会「连上了但没有画面」。
      localStream.value = await acquireLocalStream()
      if (closed) {
        stopLocalTracks()
        return
      }
      openStream()
    } finally {
      starting = false
    }
  }

  function hangup(): void {
    closed = true
    source?.close()
    source = null
    teardownPeer()
    stopLocalTracks()
    state.value = 'closed'
  }

  async function reconnect(): Promise<void> {
    hangup()
    closed = false
    await start()
  }

  // 进页面即开始：会诊室里没有「先不连，我准备好了再连」的语义，等人点就等于漏掉对方
  void start()
  // 组件销毁时必须自动收尾，否则摄像头灯与 SSE 会在离开路由后继续存在
  onScopeDispose(hangup)

  /*
   * DEV 调试出口：P2P 卡住时 UI 往往不报错（占位照常显示），
   * 只有直接读 ref 才能分清「信令没通」「track 没到」「到了但没渲染」。
   * 生产构建下这段会被 tree-shake 掉。
   */
  if (import.meta.env.DEV) {
    Reflect.set(window, '__rtcDebug', {
      signalId,
      state,
      error,
      remoteId,
      localStream,
      remoteStream,
    })
  }

  return {
    localStream,
    remoteStream,
    remoteId,
    state,
    error,
    setLocalAudioEnabled: (on: boolean) => setTrackEnabled('audio', on),
    setLocalVideoEnabled: (on: boolean) => setTrackEnabled('video', on),
    hangup,
    reconnect,
  }
}
