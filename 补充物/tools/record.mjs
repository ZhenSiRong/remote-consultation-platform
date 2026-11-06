#!/usr/bin/env node
/**
 * record.mjs —— 带鼠标轨迹可视化的演示录屏引擎（CDP + ffmpeg）
 *
 * 为什么不用 Playwright 的 recordVideo：那东西录的是原始画面，没有光标。
 * 观众看不出"点了哪里"，学不会。本脚本做三件事：
 *   ① 往页面注入一个红色光标环（跟随鼠标，带点击涟漪）
 *   ② 用 Input.dispatchMouseEvent 分步缓动移动，模拟人的手，而不是瞬移
 *   ③ Page.startScreencast 抓帧 + 记录每帧时间戳，用 ffmpeg concat 还原真实节奏
 *
 * 用法: node 补充物/tools/record.mjs <plan.json>
 *
 * plan.json:
 * {
 *   "name": "consult-demo",
 *   "viewport": { "width": 1440, "height": 900 },
 *   "fps": 20,
 *   "out": "docs/demo.mp4",
 *   "steps": [
 *     { "goto": "http://localhost:5173/consult" },
 *     { "wait": 1200 },
 *     { "move": { "selector": ".tab:nth-child(2)" }, "pause": 400 },
 *     { "click": { "selector": ".tab:nth-child(2)" } },
 *     { "type": { "selector": "input[name=keyword]", "value": "李" } },
 *     { "shot": "docs/screenshots/02-search.png" },
 *     { "js": "document.querySelector('.x').scrollIntoView()" }
 *   ]
 * }
 *
 * step 字段：
 *   goto / wait / move / click / type / js / shot / pause
 *   move|click|type 的坐标来源：selector（取元素中心）或 x/y
 *   pause：动作后额外停留毫秒（默认 300）
 */
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9500 + Math.floor(Math.random() * 400);
const ROOT = process.cwd();

/**
 * winget 装的 ffmpeg 不写 PATH（只登记在 WinGet\Links，非管理员可能没链上），
 * 所以这里主动探一次安装目录，找不到再回落到 PATH 里的 ffmpeg。
 */
function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return 'ffmpeg';
  const base = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(base)) {
    for (const dir of fs.readdirSync(base)) {
      if (!dir.toLowerCase().startsWith('gyan.ffmpeg')) continue;
      const pkg = path.join(base, dir);
      for (const sub of fs.readdirSync(pkg)) {
        const exe = path.join(pkg, sub, 'bin', 'ffmpeg.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return 'ffmpeg';
}
const FFMPEG = resolveFfmpeg();

const planPath = process.argv[2];
if (!planPath) {
  console.error('usage: node 补充物/tools/record.mjs <plan.json>');
  process.exit(1);
}
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const vw = plan.viewport?.width || 1440;
const vh = plan.viewport?.height || 900;
const outFile = path.resolve(ROOT, plan.out || 'docs/demo.mp4');
const workDir = path.resolve(ROOT, 'docs/.record-tmp');
const framesDir = path.join(workDir, 'frames');

fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
fs.mkdirSync(path.dirname(outFile), { recursive: true });

// ---------------------------------------------------------------- Chrome

// 有头模式才能拿到物理摄像头：headless 下 getUserMedia 只能返回 fake device 的彩条。
// 录真人画面时设 HEADLESS=0，窗口会被移到屏幕内可见位置（CDP screencast 抓渲染层，不怕被遮挡，
// 但要关掉后台节流，否则窗口失焦后帧率会掉）。
const HEADLESS = process.env.HEADLESS !== '0';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-rec-'));
const chrome = spawn(CHROME, [
  ...(HEADLESS ? ['--headless=new'] : [
    '--window-size=1600,900',
    '--window-position=60,60',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ]),
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,AcceptCHFrame',
  '--force-device-scale-factor=1',
  '--font-render-hinting=none',
  // 自动接受摄像头/麦克风权限，但设备仍是真实设备（不是 fake device）
  '--use-fake-ui-for-media-stream',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  `--window-size=${vw},${vh}`,
  'about:blank',
], { stdio: 'ignore' });

function cleanup(code) {
  try { chrome.kill(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

async function waitForDevtools() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('devtools not ready');
}

async function getPageTarget() {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`http://127.0.0.1:${PORT}/json`);
    const list = await r.json();
    const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (page) return page;
    await sleep(250);
  }
  throw new Error('no page target');
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
      listeners.forEach((l) => l(msg));
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

// ------------------------------------------------- 光标注入（红色环 + 涟漪）

const CURSOR_CSS = `
#__rcp_cursor{position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;
  border:2px solid #f53f3f;border-radius:50%;pointer-events:none;z-index:2147483647;
  box-shadow:0 0 0 4px rgba(245,63,63,.16),0 0 14px rgba(245,63,63,.5);
  background:rgba(245,63,63,.08);transition:transform .07s linear;will-change:transform}
#__rcp_cursor::after{content:'';position:absolute;left:50%;top:50%;width:4px;height:4px;
  margin:-2px 0 0 -2px;border-radius:50%;background:#f53f3f}
.__rcp_ripple{position:fixed;width:26px;height:26px;margin:-13px 0 0 -13px;
  border:2px solid #f53f3f;border-radius:50%;pointer-events:none;z-index:2147483646;
  animation:__rcp_pulse .62s ease-out forwards}
@keyframes __rcp_pulse{from{transform:scale(.55);opacity:.95}to{transform:scale(3.2);opacity:0}}
.__rcp_key{position:fixed;padding:2px 8px;border-radius:4px;background:#f53f3f;color:#fff;
  font:600 12px/18px system-ui,sans-serif;pointer-events:none;z-index:2147483646;
  animation:__rcp_key .7s ease-out forwards}
@keyframes __rcp_key{from{transform:translateY(0);opacity:1}to{transform:translateY(-16px);opacity:0}}
`;

function initCursorScript() {
  return `(() => {
    if (window.__rcpCursorReady) return 'already';
    const s = document.createElement('style');
    s.textContent = ${JSON.stringify(CURSOR_CSS)};
    document.head.appendChild(s);
    const dot = document.createElement('div');
    dot.id = '__rcp_cursor';
    document.body.appendChild(dot);
    window.__rcpCursorReady = true;
    window.__rcpSetCursor = (x, y) => {
      const d = document.getElementById('__rcp_cursor');
      if (d) d.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    };
    window.__rcpRipple = (x, y) => {
      const r = document.createElement('div');
      r.className = '__rcp_ripple';
      r.style.left = x + 'px';
      r.style.top = y + 'px';
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    };
    window.__rcpKey = (text) => {
      const k = document.createElement('div');
      k.className = '__rcp_key';
      k.textContent = text.length > 12 ? text.slice(0, 12) + '…' : text;
      k.style.left = 'calc(50% - 40px)';
      k.style.top = 'calc(100% - 80px)';
      document.body.appendChild(k);
      setTimeout(() => k.remove(), 800);
    };
    return 'ok';
  })()`;
}

// ------------------------------------------------------------------ main

async function main() {
  await waitForDevtools();
  const target = await getPageTarget();
  const client = cdp(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: vw, height: vh, deviceScaleFactor: 1, mobile: false,
  });

  const evaluate = async (expression) => {
    const r = await client.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 240));
    }
    return r.result?.value;
  };

  // ---- 抓帧：screencast 只在画面变化时推帧，所以必须记时间戳
  const frames = [];
  client.on((msg) => {
    if (msg.method === 'Page.screencastFrame') {
      const { data, sessionId, metadata } = msg.params;
      frames.push({ data, ts: Date.now(), meta: metadata });
      client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    }
  });

  const startCast = async () => {
    await client.send('Page.startScreencast', {
      format: 'png', maxWidth: vw, maxHeight: vh, everyNthFrame: 1,
    });
    console.log('[cast] started');
  };
  const stopCast = async () => {
    await client.send('Page.stopScreencast').catch(() => {});
    console.log(`[cast] stopped, ${frames.length} frames`);
  };

  // ---- 光标
  let cx = Math.round(vw / 2);
  let cy = Math.round(vh / 2);
  const setCursor = async (x, y) => {
    cx = x; cy = y;
    await evaluate(`window.__rcpSetCursor && window.__rcpSetCursor(${x},${y})`);
  };

  const centerOf = async (selector) => {
    const box = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!box) throw new Error(`元素不可见: ${selector}`);
    return box;
  };

  /** 按可见文本找按钮——很多按钮没有稳定 class（「查询」「发起会诊」），按文本更实际 */
  const centerByText = async (text) => {
    const box = await evaluate(`(() => {
      const nodes = [...document.querySelectorAll('button, .el-button, a, [role="button"]')];
      const el = nodes.find((n) => (n.textContent || '').trim() === ${JSON.stringify(text)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!box) throw new Error(`找不到文本按钮: ${text}`);
    return box;
  };

  /** 统一解析动作目标：selector / text / x+y 三选一 */
  const resolveTarget = async (spec) => {
    if (spec.selector) return centerOf(spec.selector);
    if (spec.text) return centerByText(spec.text);
    return { x: spec.x, y: spec.y };
  };

  /** 缓动人手轨迹：easeInOutCubic，分 26 步，总时长随距离伸缩 */
  const moveTo = async (x, y, opts = {}) => {
    const dist = Math.hypot(x - cx, y - cy);
    const steps = opts.steps || 26;
    const duration = opts.duration || Math.min(900, Math.max(260, dist * 1.6));
    const fromX = cx, fromY = cy;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const nx = Math.round(fromX + (x - fromX) * e);
      const ny = Math.round(fromY + (y - fromY) * e);
      await evaluate(`window.__rcpSetCursor && window.__rcpSetCursor(${nx},${ny})`);
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: nx, y: ny, button: 'none', buttons: 0,
      }).catch(() => {});
      cx = nx; cy = ny;
      await sleep(duration / steps);
    }
  };

  const doClick = async (x, y) => {
    await moveTo(x, y);
    await sleep(90);
    await evaluate(`window.__rcpRipple && window.__rcpRipple(${x},${y})`);
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1,
    }).catch(() => {});
    await sleep(70);
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1,
    }).catch(() => {});
    await sleep(160);
  };

  const doType = async (selector, value) => {
    await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'no-el';
      el.focus();
      // 清空再输入：上一次录制的残留值会让第二次录制搜到「李李」
      if ('value' in el) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return 'ok';
    })()`);
    // 只走 CDP 的 insertText：它会真正插入到焦点元素并触发 input 事件，
    // Vue 的 v-model 能收到。**不要**再手动 el.value += ch ——
    // 那样等于「真实按键 + 手动赋值」双写，输入框会变成「李李」。
    for (const ch of value) {
      await client.send('Input.insertText', { text: ch }).catch(() => {});
      await sleep(80);
    }
  };

  const shot = async (out) => {
    const p = path.resolve(ROOT, out);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(p, Buffer.from(data, 'base64'));
    console.log(`  [shot] ${out}`);
  };

  /**
   * 等元素「可见」而不是「存在」：表格 loading 时 tbody 行还在 DOM 里但高度为 0，
   * 只判断存在会让后续取坐标拿到 (0,0)，鼠标轨迹直接飞到左上角。
   */
  const waitForSelector = async (selector, timeout = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const ok = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })()`);
      if (ok) return true;
      await sleep(250);
    }
    return false;
  };

  // ---- 开跑
  await startCast();
  let lastTs = Date.now();

  for (const step of plan.steps) {
    try {
      if (step.goto) {
        console.log(`[goto] ${step.goto}`);
        await client.send('Page.navigate', { url: step.goto });
        await sleep(step.settle || 2200);
        await evaluate(initCursorScript());
        // 隐私打码：录制时直接给所有 <video> 加模糊，而不是后期糊固定区域。
        // 后期固定矩形挡不住人脸移动，一个转头就露；CSS 滤镜跟着元素走，永远不会露。
        if (plan.blurVideo) {
          const r = await evaluate(`(() => {
            if (document.getElementById('__rcp_blur')) return 'already';
            const s = document.createElement('style');
            s.id = '__rcp_blur';
            s.textContent = 'video{filter:blur(${Number(plan.blurVideo)}px) saturate(.92)}';
            document.head.appendChild(s);
            return 'ok';
          })()`);
          console.log(`[blur] video ${plan.blurVideo}px -> ${r}`);
        }
        await setCursor(cx, cy);
        await sleep(400);
      } else if (step.wait) {
        await sleep(step.wait);
      } else if (step.waitFor) {
        const ok = await waitForSelector(step.waitFor.selector, step.waitFor.timeout || 12000);
        console.log(`[waitFor] ${step.waitFor.selector} -> ${ok ? 'visible' : 'TIMEOUT'}`);
      } else if (step.move) {
        const { x, y } = await resolveTarget(step.move);
        await moveTo(x, y);
        await sleep(step.pause ?? 320);
      } else if (step.click) {
        const { x, y } = await resolveTarget(step.click);
        await doClick(x, y);
        await sleep(step.pause ?? 420);
      } else if (step.type) {
        if (step.type.selector || step.type.text) {
          const { x, y } = await resolveTarget(step.type);
          await doClick(x, y);
        }
        await doType(step.type.selector, step.type.value);
        await sleep(step.pause ?? 260);
      } else if (step.js) {
        const r = await evaluate(step.js);
        console.log(`[js] ${JSON.stringify(r)?.slice(0, 100)}`);
        await sleep(step.pause ?? 260);
      } else if (step.shot) {
        await shot(step.shot);
        await sleep(120);
      }
      lastTs = Date.now();
    } catch (e) {
      console.log(`  [error] ${JSON.stringify(step).slice(0, 110)}: ${e.message}`);
    }
  }

  await sleep(600);
  await stopCast();
  client.close();

  // ---- 落盘：把最后一帧的停留时间补上
  const baseTs = frames[0]?.ts ?? Date.now();
  let list = '';
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const next = frames[i + 1];
    const dur = Math.max(0.04, ((next?.ts ?? lastTs + 600) - f.ts) / 1000);
    const file = path.join(framesDir, String(i).padStart(5, '0') + '.png');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    list += `file '${file.replace(/\\/g, '/')}'\nduration ${dur.toFixed(3)}\n`;
    void baseTs;
  }
  if (frames.length) {
    // concat demuxer 要求末帧重复一次，否则最后一帧不显示
    list += `file '${path.join(framesDir, String(frames.length - 1).padStart(5, '0') + '.png').replace(/\\/g, '/')}'\n`;
  }
  const listPath = path.join(workDir, 'list.txt');
  fs.writeFileSync(listPath, list);

  console.log(`[ffmpeg] 合成 ${frames.length} 帧 -> ${plan.out}`);
  // ffmpeg 7+ 用 -fps_mode 取代 -vsync；9.0 已彻底移除旧选项
  const ff = spawnSync(FFMPEG, [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-fps_mode', 'vfr',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outFile,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  if (ff.status !== 0) {
    console.error('[ffmpeg] 失败。装 ffmpeg 后再试：winget install Gyan.FFmpeg');
    console.error(`[保留] 帧在 ${framesDir}`);
    cleanup(1);
  }
  console.log(`[done] ${outFile} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)} MB)`);
  cleanup(0);
}

main().catch((e) => { console.error('FATAL:', e.message); cleanup(1); });
