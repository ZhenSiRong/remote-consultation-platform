# RTC 接入指南：A 档已实现，B/C 档留给后人

> 面向接手这个仓库的人。看完你应该知道：现在能做到什么、什么情况下必须换方案、换的时候改哪几个文件、哪些代码一行都不用动。

## 0. 一句话现状

**A 档已实现**：原生 WebRTC P2P + SSE 信令，支持 2 方真实视频，局域网直连，零第三方依赖。

**B/C 档未实现**：云 SDK / 自建 SFU。本文档给出接入路径、改动清单、成本与验收判据。

## 1. A 档做了什么

| 项 | 实现 |
|---|---|
| 拓扑 | 单房间 2 方 P2P（`RTCPeerConnection` 一对一） |
| 信令 | SSE 接收 + POST 发送，服务端 `server/src/modules/rtc/`，内存房间表 |
| ICE | 只用 Google 公共 STUN：`stun:stun.l.google.com:19302` |
| 媒体 | `getUserMedia` 原始流直传，无转码、无 Simulcast |
| 前端 | `src/composables/useRtc.ts`，页面 `ConsultRoom.vue` 消费 |

### 能力边界（务必先读，不要误解）

| 限制 | 具体表现 | 触发场景 |
|---|---|---|
| **只支持 2 方** | 第 3 人进来会替换掉第 2 人 | 多学科会诊（MDT）需要 ≥3 方 |
| **无 TURN** | 对称 NAT / 严格企业防火墙下连不上 | 医院内网 ↔ 外网专家 |
| **无服务端录制** | 只能本地 `MediaRecorder`，拿不到混流 | R13 要求服务端留痕 |
| **无 Simulcast/SVC** | 弱网时只有整体降质，不能「保音频弃视频」 | 基层医院上行带宽差 |
| **无回声消除策略** | 依赖浏览器默认 AEC，多人同时开麦会啸叫 | ≥3 方同时说话 |
| **信令无鉴权** | 任何人知道 roomId 就能进 | 上线前必须补 token 校验 |
| **房间表在内存** | 服务重启丢房间，多实例不共享 | 横向扩容 |

### 为什么 A 档对「课程演示」够用

- 演示场景是**本机两个标签**或**同一局域网两台机器**，NAT 不构成障碍
- 2 方正好对应「本院医生 ↔ 受邀专家」这个最核心的会诊形态
- 零依赖意味着 `npm install` 不会因为多装一个 SDK 而拖慢或冲突
- 信令走纯 HTTP，穿透医院代理比 WebSocket 更容易

## 2. 什么情况下必须升级

满足**任意一条**就该升 B 或 C：

| 判据 | 阈值 | 对应方案 |
|---|---|---|
| 同时在会人数 | ≥3 | B 或 C（必须 SFU） |
| 需要服务端录制 | 是 | B 或 C |
| 跨公网/跨运营商 | 是 | B 或 C（A 无 TURN） |
| 弱网要求（丢包 10% 可用） | 是 | B（SDK 自带策略） |
| 数据不得出内网 | 是 | C（自建） |
| 合规审计要求信令可追溯 | 是 | B 或 C（A 的信令无鉴权无留痕） |

## 3. B 档：云 SDK（约 1 天）

### 三家对比

| 厂商 | 免费额度 | 实名要求 | 5 方 + 录制 | 前端接入量 |
|---|---|---|---|---|
| **LiveKit Cloud** | 每月 5,000 分钟 | 邮箱即可 | 支持 | 约 40 行 |
| 腾讯 TRTC | 每月 10,000 分钟 | 企业/个人实名 | 支持 | 约 60 行 |
| 声网 Agora | 每月 10,000 分钟 | 企业实名 | 支持 | 约 50 行 |

**课程演示首选 LiveKit Cloud**：不需要企业实名，注册最快，API 设计与本项目 `RtcProvider` 契约最接近。

### 接入点（三处，业务代码零改动）

**① 服务端：新增一个 adapter**

```
server/src/adapters/video/livekit.provider.ts
```

```ts
import type { RtcProvider, RtcRoomSpec, RtcRoomHandle, RtcTokenRequest, RtcIssuedToken } from '@rcp/shared'

export class LiveKitProvider implements RtcProvider {
  async createRoom(spec: RtcRoomSpec): Promise<RtcRoomHandle> { /* 调厂商 API */ }
  async issueToken(req: RtcTokenRequest): Promise<RtcIssuedToken> { /* 签发短期 token */ }
  async closeRoom(roomId: string): Promise<void> { /* ... */ }
  async startRecording(roomId: string): Promise<RtcRecordingHandle> { /* ... */ }
  async stopRecording(roomId: string): Promise<RtcRecordingResult> { /* ... */ }
  onEvent(listener: RtcEventListener): () => void { /* 把厂商回调归一成 RTC_EVENT_NAMES */ }
}
```

**关键约束**（写在 `shared/src/ports/rtc-provider.ts` 头部，照做即可）：
- 不许出现厂商专有名词（出现 `livekitRoomSid` 这种字段就说明抽象漏了）
- 厂商的异步回调必须先归一为内部事件（`room.joined` / `recording.started` / `peer.left`），业务只订阅内部事件
- 必须能主动模拟失败（建房间超时 / 断连 / 忙线 / 录制启动失败），否则 `5xxxx` 的负向用例无法验收

**② 服务端：切换注入**

现有的 `server/src/adapters/video/index.ts` 里 `FakeRtcProvider` 是演示替身。切换方式：

```ts
// video.module.ts
providers: [
  {
    provide: 'RTC_PROVIDER',
    useFactory: () =>
      process.env.VIDEO_PROVIDER === 'vendor'
        ? new LiveKitProvider()
        : new FakeRtcProvider(),
  },
]
```

业务代码里**禁止** `if (provider === 'x')`，只注入接口。

**③ 前端：换 `useRtc` 的内部实现**

`src/composables/useRtc.ts` 的导出签名保持不变，把内部从「原生 RTCPeerConnection」换成 SDK：

```ts
// 保持 UseRtcReturn 完全不变，页面一行不用改
export function useRtc(options: UseRtcOptions): UseRtcReturn {
  // 内部：SDK room.connect() / room.on(TrackSubscribed) → remoteStream
}
```

这是当初把 `useRtc` 抽成 composable 而不是写进页面的原因——换实现时页面零改动。

### 改动清单

| 文件 | 动作 | 工作量 |
|---|---|---|
| `server/src/adapters/video/livekit.provider.ts` | 新建 | 150 行 |
| `server/src/adapters/video/index.ts` | 删掉重复的 `RtcProvider` 定义，改 `import type` 自 shared | 20 行 |
| `server/src/modules/video/video.module.ts` | 加 provider 工厂 | 15 行 |
| `src/composables/useRtc.ts` | 换内部实现，签名不变 | 重写 200 行 |
| `server/.env` | 加 `VIDEO_PROVIDER` / `API_KEY` / `API_SECRET` | — |
| **`src/views/consult/ConsultRoom.vue`** | **不改** | 0 |
| **`shared/`** | **不改** | 0 |

### 成本

- 免费额度内：0 元（课程演示绝对够）
- 超出后：LiveKit 约 $0.0005/分钟/参会方；这个量级对课程项目无意义

## 4. C 档：自建 SFU（约 3–5 天）

### 选型

| 方案 | 语言 | 上手难度 | 适合场景 |
|---|---|---|---|
| **LiveKit 自托管** | Go | 低（Docker 一条命令） | 推荐，与 B 档 SDK 同一套 API，迁移成本最低 |
| mediasoup | C++/Node | 高 | 需要深度定制媒体处理 |
| Janus | C | 高 | 老牌，插件生态多但运维重 |

**推荐 LiveKit 自托管**：B 档的 `LiveKitProvider` 可以直接复用，只改 endpoint 和自签 token，几乎零改动。

### 部署清单（这是 C 档真正的成本）

| 项 | 要求 | 说明 |
|---|---|---|
| 公网 IP | 必须 | SFU 必须可被所有参会方直连 |
| 域名 + TLS 证书 | 必须 | `getUserMedia` 要求 HTTPS |
| TURN 服务 | 必须（coturn） | 对称 NAT 兜底，与 SFU 同机或独立 |
| 带宽 | 上行 ≥ 2 Mbps/路 | 5 方 720p 约 8 Mbps 持续上行 |
| 端口 | UDP 50000–60000 开放 | SFU 媒体端口段 |
| 运维 | 需要 | 进程守护、日志、监控、证书续期 |

### 成本估算（按月）

| 项 | 规格 | 约 |
|---|---|---|
| 云服务器 | 4 核 8G，按流量计费 | ¥200–400 |
| 带宽 | 10 Mbps 固定 | ¥300–800 |
| 域名 + 证书 | — | ¥50 |
| **合计** | | **¥550–1250/月** |

对比 B 档免费额度：**课程项目没有任何理由选 C**。只有当「数据不得出内网」是硬要求时才考虑。

## 5. 迁移时哪些代码不用动

这是本项目分层带来的红利，升级 RTC 时保持不变：

| 层 | 文件 | 为什么不用动 |
|---|---|---|
| 契约 | `shared/src/ports/rtc-provider.ts` | 就是为换实现设计的，接口已冻结 |
| 事件 | `shared/src/ports/rtc-provider.ts` 的 `RTC_EVENT_NAMES` | 11 个归一事件与厂商无关 |
| 错误码 | `shared/src/errors/codes.ts` 的 `5xxxx` 段 | 厂商错误已归一 |
| 会场字典 | `shared/src/dict/room-presence.ts` | 5 态在线 + 4 种角色与拓扑无关 |
| 业务页面 | `src/views/consult/ConsultRoom.vue` | 只消费 `useRtc` 的返回值 |
| 侧栏 | `src/components/room/RoomSidebar.vue` | 只消费 `Room` 对象 |

## 6. 升级后必须过的验收

A 档没有这些能力，所以也没写对应验收。B/C 档接完必须补：

- [ ] **5 方同时在线**：第 6 人被拒，错误码 `50002`
- [ ] **录制**：开始录制后，参会方看到合规提示（R13）；停止后能拿到 `storageRef` 与时长
- [ ] **弱网**：用 Chrome DevTools 限速到 3G，音频不断、视频自动降质
- [ ] **断线重连**：拔网线 10 秒后恢复，`presence` 走 `RECONNECTING` → `ONLINE`，不用手动重进
- [ ] **主持人控场**：HOST 静音他人 / 移出会场，被操作方立即生效
- [ ] **信令鉴权**：无 token 或 token 过期时，`joinRoom` 返回 `10002`
- [ ] **多实例**：起两个 server 实例，房间表用 Redis 共享，跨实例能连上

## 7. 已知坑（踩过或必然会踩）

1. **`getUserMedia` 必须 HTTPS 或 localhost**：用局域网 IP（`192.168.x.x`）访问会直接失败，必须自签证书或用 ngrok。
2. **ICE candidate 早于 remoteDescription 到达会抛 `InvalidStateError`**：必须缓存，等 `setRemoteDescription` 完成后再 flush。A 档的 `useRtc` 已处理，换实现时别丢。
3. **SSE 会被中间代理 60 秒掐断**：必须有 15 秒心跳注释行，A 档服务端已实现。
4. **同一个 participantId 重复进房**：浏览器刷新会先关旧连接再开新连接，但时序不保证。服务端要能覆盖旧连接。
5. **P2P 网状是 `n×(n-1)` 条流**：3 方就是每台上传 2 路，家用上行带宽直接崩——这是必须上 SFU 的数学原因，不是性能优化问题。
6. **云 SDK 的 token 必须后端签发**：绝不能把 `API_SECRET` 下发前端，A 档的 `issueRtcTokenSchema` 注释里已写明这一点。
