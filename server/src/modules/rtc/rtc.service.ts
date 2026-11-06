import { Injectable, Logger } from '@nestjs/common'

/** 信令类型只有三种，与 RTCPeerConnection 的实际交互一一对应，不做扩展 */
export type RtcSignalType = 'offer' | 'answer' | 'ice'

/**
 * 一条存活的 SSE 连接。
 * send 由控制器以闭包形式注入（内部就是 res.write），
 * 这样 service 层完全不依赖 express / HTTP 细节，将来换传输方式只改控制器。
 */
export interface PeerConnection {
  participantId: string
  roomId: string
  send: (event: string, data: unknown) => void
  connectedAt: number
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 生成带本地时区偏移的时间串（如 2026-11-06T15:00:00+08:00）。
 * 为什么不用 toISOString()：房间事件要进日志和前端调试面板，
 * UTC 的 Z 结尾每次都得手工换算，本地偏移更好读。
 */
function localIsoString(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absOffset = Math.abs(offsetMinutes)
  const offset = `${sign}${pad2(Math.floor(absOffset / 60))}:${pad2(absOffset % 60)}`
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}${offset}`
  )
}

/**
 * 房间与连接的内存表。
 *
 * 为什么是内存：信令是「同一场会诊进行中」的瞬时状态，进程重启后前端会重连并重新协商，
 * 落库既没有查询价值，还要处理连接与数据库记录的生命周期对齐问题。
 * 代价是单实例限制——多实例部署时同一房间的两个浏览器可能落在不同进程，
 * 那时再引入 Redis pub/sub，本版不做（见报告）。
 */
@Injectable()
export class RtcService {
  private readonly logger = new Logger(RtcService.name)

  /** roomId → participantId → 连接。两层 Map 是为了 O(1) 丢弃单个成员和整房间清理 */
  private readonly rooms = new Map<string, Map<string, PeerConnection>>()

  /**
   * 加入房间，返回「加入前已在房间里的人」，供新成员主动发起 offer。
   * 同时向房间内其他人广播 peer-joined。
   */
  join(conn: PeerConnection): string[] {
    let room = this.rooms.get(conn.roomId)
    if (!room) {
      room = new Map<string, PeerConnection>()
      this.rooms.set(conn.roomId, room)
    }

    // 先取 peers 再写入，否则自己会被算进「已有成员」
    const peers = [...room.keys()].filter((id) => id !== conn.participantId)

    // 同名 participantId 直接覆盖旧连接：浏览器刷新时新连接往往早于旧连接的 close 事件到达，
    // 若等待旧连接自然清理，会出现「房间里有两条同 id 连接」的短暂脏状态。
    // 覆盖后旧连接迟到的 close 由 leave(conn) 的身份比对挡掉，不会误删新连接。
    const replaced = room.get(conn.participantId)
    room.set(conn.participantId, conn)
    if (replaced) {
      // 覆盖会让旧连接变成「不再被路由」的黑洞（流还开着但收不到任何帧），
      // 这种情况在正常刷新时无害（旧连接本来就在关），但如果是两个标签页共用一个 id，
      // 会表现为「同机会诊 0 路画面」。留一条 warn 让日志能直接指出病因。
      this.logger.warn(
        `participant id duplicated: room=${conn.roomId} participant=${conn.participantId} 旧连接被替换。` +
          '同机多标签/多机器演示时 participantId 必须每标签唯一，否则只有后加入的那路能收到信令。',
      )
    }

    try {
      this.broadcast(
        conn.roomId,
        conn.participantId,
        'peer-joined',
        { from: conn.participantId, at: localIsoString(new Date()) },
        conn.participantId,
      )
    } catch (error) {
      // 广播失败不影响「我已经进房」这个事实，房间表已更新，新成员仍会收到 ready。
      this.logger.warn(`broadcast peer-joined failed room=${conn.roomId}: ${String(error)}`)
    }

    this.logger.log(
      `peer joined room=${conn.roomId} participant=${conn.participantId} peers=${peers.length}`,
    )
    return peers
  }

  /**
   * 离开房间并通知其他人。
   *
   * conn 参数做一次身份比对：同名连接被新连接覆盖后，旧连接的 close 事件仍会触发 leave，
   * 若只按 id 删除就会把刚上线的新连接踢掉（这是 SSE 重连最容易踩的坑）。
   */
  leave(roomId: string, participantId: string, conn?: PeerConnection): void {
    const room = this.rooms.get(roomId)
    if (!room) return

    const current = room.get(participantId)
    if (!current) return
    if (conn && current !== conn) return

    try {
      room.delete(participantId)
      if (room.size === 0) {
        // 空房间立刻回收，否则 rooms 表会随会诊数量无界增长
        this.rooms.delete(roomId)
      }
    } finally {
      this.broadcast(roomId, participantId, 'peer-left', {
        from: participantId,
        at: localIsoString(new Date()),
      })
      this.logger.log(`peer left room=${roomId} participant=${participantId}`)
    }
  }

  /**
   * 向房间内除 exceptId 外的所有人推送，返回成功写入的连接数。
   * 返回值给 POST 的 delivered 用，前端据此判断广播是否有人在线。
   */
  broadcast(
    roomId: string,
    from: string,
    event: string,
    data: unknown,
    exceptId?: string,
  ): number {
    const room = this.rooms.get(roomId)
    if (!room) return 0

    let delivered = 0
    for (const [id, peer] of room) {
      if (id === exceptId) continue
      try {
        peer.send(event, data)
        delivered += 1
      } catch (error) {
        // 单条连接的写失败（对端已断、socket 已销毁）不能中断对其他成员的广播，
        // 该连接的清理交给它自己的 close 事件，这里只记录。
        this.logger.warn(
          `send failed room=${roomId} from=${from} to=${id}: ${String(error)}`,
        )
      }
    }
    return delivered
  }

  /**
   * 点对点推送，返回是否投递成功（0/1）。
   * 事件体里的 from 由调用方放进 data，所以这里不再单独收 from 参数，避免同一事实两处维护。
   */
  sendTo(roomId: string, toId: string, event: string, data: unknown): number {
    const peer = this.rooms.get(roomId)?.get(toId)
    if (!peer) return 0
    try {
      peer.send(event, data)
      return 1
    } catch (error) {
      this.logger.warn(`send failed room=${roomId} to=${toId}: ${String(error)}`)
      return 0
    }
  }

  /** 调试用快照：当前所有房间与在线成员 */
  listRooms(): Array<{ roomId: string; peers: string[] }> {
    return [...this.rooms.entries()].map(([roomId, members]) => ({
      roomId,
      peers: [...members.keys()],
    }))
  }
}
