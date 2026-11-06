import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import type { Request, Response } from 'express'

import type { PeerConnection, RtcSignalType } from './rtc.service'
import { RtcService } from './rtc.service'

/**
 * 15s 一次注释帧保活。
 * 为什么需要：浏览器与中间代理（nginx、公司网关）都会主动掐掉长时间静默的 HTTP 连接，
 * SSE 默认不带心跳，会诊中两人沉默半分钟就断线，比不加更糟。
 */
const HEARTBEAT_MS = 15_000

/**
 * 请求体按「不可信输入」处理：字段类型一律 unknown，运行时逐个校验。
 * 项目没装 class-validator，手写守卫比为一个端点引入 validator 依赖划算。
 */
interface StreamQuery {
  roomId?: unknown
  participantId?: unknown
}

interface SignalBody {
  roomId?: unknown
  from?: unknown
  to?: unknown
  type?: unknown
  payload?: unknown
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} 必填，且必须是非空字符串`)
  }
  return value
}

function requireSignalType(value: unknown): RtcSignalType {
  const raw = requireString(value, 'type')
  // 逐个字面量比较而不是 includes + 断言，避免把非法值当合法类型传下去
  if (raw !== 'offer' && raw !== 'answer' && raw !== 'ice') {
    throw new BadRequestException(`type 只能是 offer / answer / ice，收到 ${raw}`)
  }
  return raw
}

/**
 * RTC 信令端点。
 *
 * 只做 HTTP 映射与入参校验，房间逻辑全在 RtcService。
 * 路径不带全局前缀（main.ts 没有 setGlobalPrefix），故直接写 rtc/signal。
 */
@Controller('rtc/signal')
export class RtcController {
  constructor(private readonly rtcService: RtcService) {}

  /**
   * SSE 长连接。
   *
   * 不用 Nest 的 @Sse()：它要求返回 Observable，而我们需要在 req/res 关闭时精确地把
   * 这条连接从房间表里摘掉。手动持有 res 才能保证 peer-left 一定广播出去。
   */
  @Get('stream')
  stream(@Query() query: StreamQuery, @Req() req: Request, @Res() res: Response): void {
    const roomId = requireString(query.roomId, 'roomId')
    const participantId = requireString(query.participantId, 'participantId')

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform 阻止中间代理压缩/改写流式响应，否则 EventSource 解析会错位
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // nginx 默认缓冲 upstream 响应，会攒够 buffer 才下发，SSE 等于失效
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()

    /** 写一帧 SSE。writableEnded 之后写入会抛 ERR_STREAM_WRITE_AFTER_END，必须先挡 */
    const writeFrame = (event: string, data: unknown): void => {
      if (res.writableEnded) return
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const connection: PeerConnection = {
      participantId,
      roomId,
      connectedAt: Date.now(),
      send: writeFrame,
    }

    // join 内部会向房间内其他人广播 peer-joined，并在返回值里给出已有的 peers
    const peers = this.rtcService.join(connection)
    writeFrame('ready', { selfId: participantId, roomId, peers })

    const heartbeat = setInterval(() => {
      if (res.writableEnded) return
      // 注释帧（以冒号开头）不会触发 EventSource 的 message 事件，纯粹用来续命
      res.write(': ping\n\n')
    }, HEARTBEAT_MS)

    let cleaned = false
    const cleanup = (): void => {
      // req 与 res 的 close 可能先后各来一次，用标志位保证只清理一次
      if (cleaned) return
      cleaned = true
      clearInterval(heartbeat)
      this.rtcService.leave(roomId, participantId, connection)
      if (!res.writableEnded) res.end()
    }

    req.on('close', cleanup)
    res.on('close', cleanup)
  }

  /**
   * 发送一条信令。payload 原样透传——不同浏览器与版本的 SDP 字段差异很大，
   * 服务端一旦解析就会把「合法但没见过的字段」当错误，反而制造 bug。
   */
  @Post()
  @HttpCode(200)
  send(@Body() body: SignalBody): { ok: boolean; delivered: number } {
    const roomId = requireString(body.roomId, 'roomId')
    const from = requireString(body.from, 'from')
    const type = requireSignalType(body.type)
    // payload 缺省用空对象：服务端不关心内容，只保证帧结构稳定
    const payload = body.payload ?? {}

    const event = { from, type, payload }

    // to 省略（undefined / null / 空串）视为广播给房间内除自己外所有人
    if (body.to === undefined || body.to === null || body.to === '') {
      const delivered = this.rtcService.broadcast(roomId, from, 'signal', event, from)
      return { ok: true, delivered }
    }

    const to = requireString(body.to, 'to')
    const delivered = this.rtcService.sendTo(roomId, to, 'signal', event)
    // 对端不在线时仍返回 200：信令丢失由 WebRTC 的 ICE 重传兜底，
    // 这里报错只会让前端多做一层无意义的重试。
    return { ok: delivered > 0, delivered }
  }

  /** 调试用：当前所有房间与在线成员 */
  @Get('rooms')
  rooms(): { rooms: Array<{ roomId: string; peers: string[] }> } {
    return { rooms: this.rtcService.listRooms() }
  }
}
