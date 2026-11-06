#!/usr/bin/env node
/**
 * verify.mjs —— 演示切片端到端验收（CDP 驱动，真点真跑）
 *
 * 为什么不用断言库：这个脚本要证明的是「浏览器里点下去有反应」，
 * 不是「函数返回了预期值」。所以每条断言都从渲染后的 DOM 取证据，
 * 而不是读内存变量——后者在 mock 阶段很容易自欺。
 *
 * 用法（需先 npm run dev）:
 *   node 补充物/tools/verify.mjs
 *
 * 退出码：0 = 全过；1 = 有失败项。
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.APP_BASE || 'http://localhost:5173';
const PORT = 9600 + Math.floor(Math.random() * 300);
const vw = 1440;
const vh = 900;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —— ' + detail : ''}`);
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-verify-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check',
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
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch {}
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
    send(method, params = {}) {
      const i = ++id;
      ws.send(JSON.stringify({ id: i, method, params }));
      return new Promise((resolve, reject) => pending.set(i, { resolve, reject }));
    },
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

  const js = async (expression) => {
    const r = await client.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
    return r.result?.value;
  };

  const goto = async (url, waitMs = 2600) => {
    await client.send('Page.navigate', { url: BASE + url });
    await sleep(waitMs);
  };

  const waitFor = async (selector, timeout = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await js(`!!document.querySelector(${JSON.stringify(selector)})`)) return true;
      await sleep(250);
    }
    return false;
  };

  const clickSel = async (selector) => {
    const ok = await js(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()`);
    await sleep(700);
    return ok;
  };

  const clickText = async (text) => {
    const ok = await js(`(() => {
      const nodes = [...document.querySelectorAll('button, .el-button, .consult-tab')];
      const el = nodes.find((n) => (n.textContent || '').trim().includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()`);
    await sleep(700);
    return ok;
  };

  console.log('\n=== 1. 列表页 /consult ===');
  await goto('/consult', 3200);
  await waitFor('.consult-tab');

  const tabs = await js(`[...document.querySelectorAll('.consult-tab')].map(t => ({
    label: (t.querySelector('.consult-tab__label')?.textContent || '').trim(),
    badge: (t.querySelector('.consult-tab__badge')?.textContent || '').trim(),
  }))`);
  check('5 个页签', Array.isArray(tabs) && tabs.length === 5, `实际 ${tabs?.length}`);
  check('徽标数字全非空', (tabs || []).every((t) => t.badge !== ''), JSON.stringify((tabs || []).map((t) => t.badge)));
  check('「全部」徽标 = 12', tabs?.[0]?.badge === '12', `实际 ${tabs?.[0]?.badge}`);

  const firstPatient = await js(`(() => {
    const row = document.querySelector('.pro-table__row');
    if (!row) return null;
    const cells = [...row.querySelectorAll('td')];
    return cells[1]?.textContent?.trim() || null;
  })()`);
  check('患者列已脱敏（/^李\\*/）', /^李\*/.test(firstPatient || ''), `实际「${firstPatient}」`);

  const dotColors = await js(`[...document.querySelectorAll('.status-tag__dot')].slice(0, 6).map(d => getComputedStyle(d).backgroundColor)`);
  check('状态色点全部实色', (dotColors || []).length > 0 && dotColors.every((c) => c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)'), JSON.stringify(dotColors?.slice(0, 3)));

  const rowCount = await js(`document.querySelectorAll('.pro-table__row').length`);
  check('首页 10 行', rowCount === 10, `实际 ${rowCount}`);

  console.log('\n=== 2. 搜索「李」 ===');
  const filled = await js(`(() => {
    const el = document.querySelector('.consult-list input[placeholder*="患者姓名"]')
      || document.querySelector('.consult-list input');
    if (!el) return 'no-input';
    el.focus();
    el.value = '李';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(300);
  const searched = await clickText('查询');
  await sleep(1200);
  const searchRows = await js(`document.querySelectorAll('.pro-table__row').length`);
  check('搜索「李」行数 < 12', filled === 'ok' && searchRows > 0 && searchRows < 12, `输入 ${filled}，查询 ${searched}，结果 ${searchRows} 行`);

  console.log('\n=== 3. 详情页与动作集合 ===');
  await goto('/consult', 2800);
  await waitFor('.pro-table__row');
  await clickSel('.pro-table__row');
  await sleep(1500);
  const detailUrl = await js('location.pathname');
  check('点行进入详情', /^\/consult\/ord-/.test(detailUrl), `实际 ${detailUrl}`);
  await waitFor('.consult-action-bar');

  const actions = await js(`[...document.querySelectorAll('.action-bar__action')].map(b => b.getAttribute('data-action'))`);
  check('待受理动作 = {ACCEPT, VOID}', Array.isArray(actions) && actions.length === 2 && actions.includes('ACCEPT') && actions.includes('VOID'), JSON.stringify(actions));
  check('不出现 START/FINISH/ARCHIVE', !(actions || []).some((a) => ['START', 'FINISH', 'ARCHIVE'].includes(a)), JSON.stringify(actions));

  const statusTextBefore = await js(`(document.querySelector('.status-tag')?.textContent || '').trim()`);
  check('初始状态为「待受理」', statusTextBefore.includes('待受理'), `实际「${statusTextBefore}」`);

  console.log('\n=== 4. 受理 → 状态流转 ===');
  await clickSel('.action-bar__action--accept');
  await sleep(1600);
  const statusAfter = await js(`(() => {
    const tag = document.querySelector('.status-tag');
    const dot = document.querySelector('.status-tag__dot');
    return {
      text: (tag?.textContent || '').trim(),
      color: dot ? getComputedStyle(dot).backgroundColor : null,
    };
  })()`);
  check('状态变为「已受理」', (statusAfter?.text || '').includes('已受理'), `实际「${statusAfter?.text}」`);
  check('色点变主色 rgb(22, 119, 255)', statusAfter?.color === 'rgb(22, 119, 255)', `实际 ${statusAfter?.color}`);

  console.log('\n=== 5. 非法流转 → 20005 ===');
  const demoClicked = await clickSel('.action-bar__demo');
  await sleep(1400);
  const errText = await js(`(document.querySelector('.consult-detail__error')?.textContent || '').trim()`);
  check('演示按钮触发 20005 红条', demoClicked && errText.includes('20005'), errText.slice(0, 80) || '未出现红条');
  const statusNotRollback = await js(`(document.querySelector('.status-tag')?.textContent || '').trim()`);
  check('非法流转后状态不回滚', statusNotRollback.includes('已受理'), `实际「${statusNotRollback}」`);

  console.log('\n=== 6. 首诊拦截 20003 ===');
  await goto('/consult/create?patientId=pat-1005', 3000);
  await waitFor('.consult-create');
  const blockedPanel = await js(`!!document.querySelector('.compliance-panel__blocked')`);
  check('首诊患者触发合规阻断面板', blockedPanel, blockedPanel ? '' : '未出现 .compliance-panel__blocked');

  const submitClicked = await clickSel('.consult-create__submit');
  await sleep(1200);
  const createErr = await js(`(document.querySelector('.consult-create__blocked')?.textContent || '').trim()`);
  check('点提交出现 20003 拦截条', submitClicked && createErr.includes('20003'), createErr.slice(0, 80) || '未出现拦截条');

  console.log('\n=== 7. traceId 透传 ===');
  // 注意：不能用原生 fetch 验——mock 是 axios adapter，只拦 axios 的请求，
  // 原生 fetch 会打到 vite 拿到 index.html。traceId 从上面那条 20005 红条里取，
  // 它本身就是「请求 → 后端错误 → 前端渲染」这条链路留下的证据。
  const traceId = (errText.match(/traceId[:：]\s*([0-9a-f]+)/i) || [])[1];
  check('traceId 为 16–32 位 hex', typeof traceId === 'string' && /^[0-9a-f]{16,32}$/i.test(traceId), traceId || '未从红条中提取到');

  // ---- 汇总
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(58));
  console.log(`验收结果：${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) {
    console.log('失败项：');
    failed.forEach((f) => console.log(`  - ${f.name}  ${f.detail}`));
  }
  console.log('='.repeat(58) + '\n');

  client.close();
  cleanup(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e.message); cleanup(1); });
