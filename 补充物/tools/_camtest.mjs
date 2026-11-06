#!/usr/bin/env node
/**
 * 有头 Chrome 能不能拿到真实摄像头？—— 一次性验证脚本
 *
 * headless 模式下 getUserMedia 拿不到物理设备，只能靠 --use-fake-device-for-media-stream
 * 生成彩条。要录真实画面必须开有头窗口。这里测三件事：
 * 1. localStream 里有没有 video track，track.label 是不是物理设备名（说明是真摄像头不是彩条）
 * 2. track.getSettings() 的分辨率/帧率
 * 3. 截图看画面是不是真有内容
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9455;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-cam-'));

const chrome = spawn(CHROME, [
  '--disable-gpu',
  '--no-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,AcceptCHFrame',
  // 自动接受摄像头/麦克风权限（弹窗会卡住无人值守的录制）
  '--use-fake-ui-for-media-stream',
  // 窗口被遮挡或被系统判定不可见时，不要节流渲染，否则 screencast 会掉帧
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--window-size=1600,900',
  '--window-position=40,40',
  'about:blank',
], { stdio: 'ignore' });

const cleanup = (code) => {
  try { chrome.kill(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  process.exit(code);
};

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  return {
    ready,
    send(m, p = {}) {
      const i = ++id;
      ws.send(JSON.stringify({ id: i, method: m, params: p }));
      return new Promise((resolve, reject) => pending.set(i, { resolve, reject }));
    },
    close() { try { ws.close(); } catch {} },
  };
}

async function main() {
  let page = null;
  for (let i = 0; i < 80 && !page; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await r.json();
      page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || null;
    } catch { /* not ready */ }
    if (!page) await sleep(250);
  }
  if (!page) throw new Error('devtools 未就绪');

  const client = cdp(page.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  const evaluate = async (expression) => {
    const r = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 200));
    return r.result?.value;
  };

  await client.send('Page.navigate', { url: 'http://localhost:5173/consult/ord-0001/room' });
  console.log('[wait] 12s 等页面采集…');
  await sleep(12000);

  // 设备清单：videoinput 的 label 为空说明还没拿到权限；有 label 说明权限 OK、设备可枚举
  const devices = await evaluate(
    `navigator.mediaDevices.enumerateDevices().then((ds) => ds.map((d) => ({ kind: d.kind, label: d.label })))`,
  );
  console.log('[设备清单]', JSON.stringify(devices, null, 2));

  // 单独试一次 gUM，把错误名打出来（NotReadableError = 被别的程序占用；NotAllowedError = 权限）
  const gum = await evaluate(`(() => {
    const d = window.__rtcDebug;
    if (d && d.localStream.value) {
      d.localStream.value.getTracks().forEach((t) => t.stop());
    }
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then((s) => {
        const t = s.getVideoTracks()[0];
        const r = { ok: true, label: t && t.label, settings: t && t.getSettings() };
        s.getTracks().forEach((x) => x.stop());
        return r;
      })
      .catch((e) => ({ ok: false, name: e.name, message: e.message }));
  })()`);
  console.log('[直接 gUM]', JSON.stringify(gum, null, 2));

  const info = await evaluate(`(() => {
    const d = window.__rtcDebug;
    if (!d) return { err: 'no __rtcDebug' };
    const s = d.localStream.value;
    if (!s) return { err: 'localStream is null', rtcError: d.error.value };
    return {
      tracks: s.getVideoTracks().map((t) => ({
        label: t.label,
        state: t.readyState,
        enabled: t.enabled,
        settings: t.getSettings(),
      })),
      audio: s.getAudioTracks().map((t) => ({ label: t.label, state: t.readyState })),
      rtcState: d.state.value,
      rtcError: d.error.value,
    };
  })()`);
  console.log('[摄像头]', JSON.stringify(info, null, 2));

  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  const out = path.resolve(process.cwd(), 'docs/screenshots/_camtest.png');
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('[shot]', out);

  client.close();
  cleanup(0);
}

main().catch((e) => { console.error('FATAL:', e.message); cleanup(1); });
