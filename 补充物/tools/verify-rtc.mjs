#!/usr/bin/env node
/**
 * verify-rtc.mjs —— 验 WebRTC P2P 真的通了，而不是「页面没报错」
 *
 * 为什么必须开两个浏览器实例：P2P 的成立条件是两端的 SDP/ICE 协商完成并在
 * 各自渲染出对端画面。单开一个页面永远只能证明「信令连上了」，证明不了媒体通了。
 *
 * 为什么加 fake device：headless 没有摄像头，`getUserMedia` 会直接拒绝；
 * `--use-fake-device-for-media-stream` 会生成彩条视频，`--use-fake-ui-for-media-stream`
 * 自动授权。这两条让 CI/无摄像头机器也能验真实的 track 传输。
 *
 * 判定标准：远端 video 元素的 `videoWidth > 0`。这个值只有在**真的收到并解码了
 * 视频帧**时才非零——`srcObject` 有值但 `videoWidth === 0` 说明只是挂了个空流。
 *
 * 用法（需先启动 dev:5173 与 server:3000）:
 *   node 补充物/tools/verify-rtc.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = process.env.APP_BASE || 'http://localhost:5173';
const SIGNAL = process.env.SIGNAL_BASE || 'http://localhost:3000';
const ROOM_PATH = '/consult/ord-0001/room';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —— ' + detail : ''}`);
};

function launch(port) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `cdp-rtc-${port}-`));
  const child = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,AcceptCHFrame',
    // 假设备 + 自动授权：无摄像头环境也能拿到真实 track
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1600,900',
    'about:blank',
  ], { stdio: 'ignore' });
  return { child, userDataDir, port };
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      listeners.forEach((fn) => fn(msg));
    }
  };
  return {
    ready,
    send(method, params = {}) {
      const i = ++id;
      ws.send(JSON.stringify({ id: i, method, params }));
      return new Promise((resolve, reject) => pending.set(i, { resolve, reject }));
    },
    on(fn) { listeners.push(fn); },
    close() { try { ws.close(); } catch {} },
  };
}

async function attach(port) {
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json`);
      const list = await r.json();
      page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || null;
    } catch { /* devtools 还没起 */ }
    if (!page) await sleep(250);
  }
  if (!page) throw new Error(`实例 ${port} 的 devtools 未就绪`);
  const client = cdp(page.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  // 视口必须显式指定：headless 下 --window-size 不保证等于视口，
  // 不设的话页面按 ~760px 渲染，会诊室的两栏布局会被挤塌（侧栏吃掉整个主区）
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  // 收集 console + 页面异常：P2P 协商失败几乎不会在 UI 上报错，只能从这里看
  const logs = [];
  client.on((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? '')
        .join(' ');
      logs.push(`[${msg.params.type}] ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push(`[exception] ${msg.params.exceptionDetails?.text ?? ''}`);
    }
  });
  client.logs = logs;
  return client;
}

async function evaluate(client, expression) {
  const r = await client.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
  return r.result?.value;
}

/** 读页面里所有 video 的真实状态 */
const PROBE = `(() => {
  const videos = [...document.querySelectorAll('video')];
  return videos.map((v) => {
    const s = v.srcObject;
    return {
      w: v.videoWidth,
      h: v.videoHeight,
      muted: v.muted,
      hasStream: Boolean(s),
      videoTracks: s ? s.getVideoTracks().length : 0,
      audioTracks: s ? s.getAudioTracks().length : 0,
      paused: v.paused,
    };
  });
})()`;

/**
 * 页面加载前注入探针：hook EventSource / RTCPeerConnection / fetch。
 * 为什么必须 hook 而不是读页面状态：P2P 卡住时 UI 往往什么都不报，
 * 只有「信令收到了什么、pc 走到哪个状态、offer 有没有发出去」这三条能定位问题。
 */
const PROBE_SCRIPT = `(() => {
  window.__rtcLog = [];
  const push = (t, d) => window.__rtcLog.push({ t, d: String(d ?? '').slice(0, 400) });

  const OrigES = window.EventSource;
  function PatchedES(url, opts) {
    const es = new OrigES(url, opts);
    push('es.url', url);
    ['open', 'ready', 'peer-joined', 'peer-left', 'signal', 'error', 'message'].forEach((n) => {
      es.addEventListener(n, (e) => push('es.' + n, e && e.data ? e.data : ''));
    });
    return es;
  }
  PatchedES.prototype = OrigES.prototype;
  ['CONNECTING', 'OPEN', 'CLOSED'].forEach((k) => { PatchedES[k] = OrigES[k]; });
  window.EventSource = PatchedES;

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    const isSignal = String(url).includes('/rtc/signal');
    if (isSignal) push('fetch.out', (init && init.method || 'GET') + ' ' + url);
    return origFetch.apply(this, arguments).then((r) => {
      if (isSignal) push('fetch.in', r.status + ' ' + url);
      return r;
    }).catch((e) => {
      if (isSignal) push('fetch.err', String(e && e.message || e));
      throw e;
    });
  };

  const OrigPC = window.RTCPeerConnection;
  function PatchedPC() {
    const pc = new OrigPC(...arguments);
    push('pc.new', '');
    ['connectionstatechange', 'iceconnectionstatechange', 'signalingstatechange', 'icegatheringstatechange'].forEach((n) => {
      pc.addEventListener(n, () => push('pc.' + n, pc.connectionState + ' | ice=' + pc.iceConnectionState + ' | sig=' + pc.signalingState));
    });
    pc.addEventListener('track', () => push('pc.track', 'got remote track'));
    pc.addEventListener('icecandidate', (e) => push('pc.icecandidate', e.candidate ? 'candidate' : 'END'));
    return pc;
  }
  PatchedPC.prototype = OrigPC.prototype;
  window.RTCPeerConnection = PatchedPC;
})();`;

async function main() {
  console.log('\n=== 启动两个浏览器实例（各自独立 user-data-dir）===');
  const a = launch(9333);
  const b = launch(9334);
  const cleanup = () => {
    for (const inst of [a, b]) {
      try { inst.child.kill(); } catch {}
      try { fs.rmSync(inst.userDataDir, { recursive: true, force: true }); } catch {}
    }
  };

  try {
    const [ca, cb] = [await attach(a.port), await attach(b.port)];
    console.log('[ok] 两个实例的 devtools 均已就绪');

    // 探针必须在导航前注入，否则页面里的 useRtc 在模块加载时就已经拿到原始的 EventSource
    for (const c of [ca, cb]) {
      await c.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE_SCRIPT });
    }

    await ca.send('Page.navigate', { url: APP + ROOM_PATH });
    await sleep(3000);
    await cb.send('Page.navigate', { url: APP + ROOM_PATH });

    // 给 ICE 收集 + 协商留足时间：headless 下 STUN 往往要 3–6 秒
    console.log('[wait] 等待 P2P 协商（15s）…');
    await sleep(15000);

    const rooms = await (await fetch(`${SIGNAL}/rtc/signal/rooms`)).json();
    const room = rooms.rooms?.find((r) => r.roomId === 'ord-0001');
    check('信令房间里有 2 个连接', Boolean(room) && room.peers.length === 2,
      room ? JSON.stringify(room.peers) : '房间不存在');

    const probeA = await evaluate(ca, PROBE);
    const probeB = await evaluate(cb, PROBE);

    // 页面上的连接状态文案：比 video 元素更能说明「卡在哪一步」
    const STATE_PROBE = `(() => {
      const stage = document.querySelector('.consult-room__remote');
      const badge = document.querySelector('.consult-room__remote-status');
      return {
        stageText: (stage?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
        badge: (badge?.innerText || '').trim(),
        topbar: (document.querySelector('.consult-room__topbar')?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
      };
    })()`;
    const sA = await evaluate(ca, STATE_PROBE);
    const sB = await evaluate(cb, STATE_PROBE);
    console.log('\n[A 侧界面状态]', JSON.stringify(sA));
    console.log('[B 侧界面状态]', JSON.stringify(sB));

    // useRtc 暴露的 DEV 调试口：直接读 ref，能分清「track 没到」还是「到了没渲染」
    const DEBUG_PROBE = `(() => {
      const d = window.__rtcDebug;
      if (!d) return null;
      const kinds = (s) => (s ? s.getTracks().map((t) => t.kind) : null);
      return {
        signalId: d.signalId,
        state: d.state.value,
        error: d.error.value,
        remoteId: d.remoteId.value,
        local: kinds(d.localStream.value),
        remote: kinds(d.remoteStream.value),
      };
    })()`;
    const dA = await evaluate(ca, DEBUG_PROBE);
    const dB = await evaluate(cb, DEBUG_PROBE);
    console.log('[A useRtc]', JSON.stringify(dA));
    console.log('[B useRtc]', JSON.stringify(dB));
    console.log('[A console]', ca.logs.slice(-8).join(' | ') || '(无)');
    console.log('[B console]', cb.logs.slice(-8).join(' | ') || '(无)');

    const rtcA = await evaluate(ca, 'window.__rtcLog || []');
    const rtcB = await evaluate(cb, 'window.__rtcLog || []');
    console.log('\n[A RTC 探针]');
    rtcA.forEach((x) => console.log(`   ${x.t}  ${x.d}`));
    console.log('[B RTC 探针]');
    rtcB.forEach((x) => console.log(`   ${x.t}  ${x.d}`));

    // 留存证据截图
    for (const [name, client] of [['a', ca], ['b', cb]]) {
      const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
      const out = path.resolve(process.cwd(), `docs/screenshots/_rtc-${name}.png`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(data, 'base64'));
    }

    // 判定：至少有一个 video 是「有画面」的（videoWidth > 0）
    // 本地小窗 muted=true，远端 muted=false，用这个区分
    const remoteOf = (probe) => probe.find((v) => !v.muted) ?? null;
    const ra = remoteOf(probeA);
    const rb = remoteOf(probeB);

    check('A 侧有远端 video 元素', Boolean(ra), JSON.stringify(probeA));
    check('B 侧有远端 video 元素', Boolean(rb), JSON.stringify(probeB));
    check('A 侧远端视频已解码出帧（videoWidth > 0）', Boolean(ra && ra.w > 0),
      ra ? `${ra.w}x${ra.h}, tracks=${ra.videoTracks}` : '无');
    check('B 侧远端视频已解码出帧（videoWidth > 0）', Boolean(rb && rb.w > 0),
      rb ? `${rb.w}x${rb.h}, tracks=${rb.videoTracks}` : '无');

    // 信令 id 必须唯一，否则房间表会互相顶掉
    check('两端信令 id 不同（未被顶掉）', Boolean(room) && new Set(room.peers).size === 2,
      room ? JSON.stringify(room.peers) : '');

    // 断线：关掉 B，A 应回到占位
    await cb.send('Page.navigate', { url: 'about:blank' }).catch(() => {});
    await sleep(3500);
    const roomsAfter = await (await fetch(`${SIGNAL}/rtc/signal/rooms`)).json();
    const roomAfter = roomsAfter.rooms?.find((r) => r.roomId === 'ord-0001');
    check('B 断开后房间里只剩 1 人', !roomAfter || roomAfter.peers.length === 1,
      roomAfter ? JSON.stringify(roomAfter.peers) : '房间已回收');

    ca.close();
    cb.close();
  } finally {
    cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(56));
  console.log(`RTC 联调结果：${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) failed.forEach((f) => console.log(`  FAIL ${f.name}  ${f.detail}`));
  console.log('='.repeat(56) + '\n');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
