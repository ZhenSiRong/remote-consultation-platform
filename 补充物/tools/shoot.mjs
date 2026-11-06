#!/usr/bin/env node
/**
 * shoot.mjs — 基于 Chrome DevTools Protocol 的无头截图引擎
 * 用法: node scripts/shoot.mjs <plan.json>
 *
 * plan.json 结构:
 * {
 *   "name": "openemr",
 *   "viewport": { "width": 1440, "height": 900 },
 *   "steps": [
 *     { "goto": "https://..." },
 *     { "wait": 2000 },
 *     { "shot": "screenshots/xx.png" },
 *     { "fill": { "selector": "#user", "value": "admin" } },
 *     { "click": { "selector": "button[type=submit]" } },
 *     { "waitFor": { "selector": ".dashboard", "timeout": 15000 } },
 *     { "shot": "screenshots/yy.png", "full": true }
 *   ]
 * }
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9400 + Math.floor(Math.random() * 500);
const ROOT = process.cwd();

const planPath = process.argv[2];
if (!planPath) {
  console.error('usage: node scripts/shoot.mjs <plan.json>');
  process.exit(1);
}
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const vw = plan.viewport?.width || 1440;
const vh = plan.viewport?.height || 900;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-shot-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,AcceptCHFrame',
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
    const r = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval error: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result?.value;
  };

  const waitSelector = async (selector, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
      if (found) return true;
      await sleep(300);
    }
    return false;
  };

  const shot = async (out, full) => {
    const outPath = path.resolve(ROOT, out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const params = { format: 'png' };
    if (full) {
      const { contentSize } = await client.send('Page.getLayoutMetrics');
      params.captureBeyondViewport = true;
      params.clip = { x: 0, y: 0, width: Math.ceil(contentSize.width), height: Math.ceil(contentSize.height), scale: 1 };
    }
    const { data } = await client.send('Page.captureScreenshot', params);
    fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
    console.log(`  [shot] ${out}${full ? ' (full)' : ''} -> ${fs.statSync(outPath).size} bytes`);
  };

  const log = [];
  for (const step of plan.steps) {
    try {
      if (step.goto) {
        console.log(`[goto] ${step.goto}`);
        await client.send('Page.navigate', { url: step.goto });
        await sleep(step.settle || 2500);
      } else if (step.wait) {
        await sleep(step.wait);
      } else if (step.waitFor) {
        const ok = await waitSelector(step.waitFor.selector, step.waitFor.timeout || 15000);
        console.log(`[waitFor] ${step.waitFor.selector} -> ${ok ? 'found' : 'TIMEOUT'}`);
        log.push({ step: 'waitFor', selector: step.waitFor.selector, ok });
      } else if (step.fill) {
        const r = await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(step.fill.selector)});
          if (!el) return 'no-el';
          el.focus();
          el.value = ${JSON.stringify(step.fill.value)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return 'ok';
        })()`);
        console.log(`[fill] ${step.fill.selector} -> ${r}`);
      } else if (step.click) {
        const r = await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(step.click.selector)});
          if (!el) return 'no-el';
          el.click();
          return 'ok';
        })()`);
        console.log(`[click] ${step.click.selector} -> ${r}`);
      } else if (step.js) {
        const r = await evaluate(step.js);
        console.log(`[js] -> ${JSON.stringify(r)?.slice(0, 120)}`);
      } else if (step.shot) {
        await shot(step.shot, step.full);
      }
    } catch (e) {
      console.log(`  [error] step ${JSON.stringify(step).slice(0, 120)}: ${e.message}`);
      log.push({ step, error: e.message });
    }
  }
  client.close();
  cleanup(0);
}

main().catch((e) => { console.error('FATAL:', e.message); cleanup(1); });
