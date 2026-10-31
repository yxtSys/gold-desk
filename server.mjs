// server.mjs —— 黄金研究台常驻服务：看板 + 轮询告警 + 邮件推送
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildSnapshot } from './lib/desk.mjs';
import { evaluate, filterByCooldown, markSent } from './lib/rules.mjs';
import { compose } from './lib/notify.mjs';
import { sendMail } from './lib/mailer.mjs';
import { runReport } from './lib/report-run.mjs';
import { loadEvents, eventWindow } from './lib/events.mjs';

const PORT = Number(process.env.PORT || 8848);
const ROOT = process.cwd();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

let cache = { at: 0, data: null };
const TTL = 20000;

let cfg = { alerts: {}, email: {} };
let state = {};

async function loadConfig() {
  try { cfg = JSON.parse(await readFile('config.json', 'utf8')); } catch (e) { console.warn('[config]', e.message); }
  try { state = JSON.parse(await readFile('data/alert-state.json', 'utf8')); } catch { state = {}; }
}

async function getSnapshot(force = false) {
  if (!force && cache.data && Date.now() - cache.at < TTL) return cache.data;
  const data = await buildSnapshot();
  cache = { at: Date.now(), data };
  return data;
}

// ---------- 告警轮询 ----------
let lastAlertAt = 0;
async function tick() {
  try {
    await loadConfig(); // 支持改了 config.json 不重启
    const s = await getSnapshot(true);
    s.cfg = cfg.alerts || {};
    const all = evaluate(s);
    const fresh = filterByCooldown(all, state, cfg.alerts?.cooldownHours ?? 4);
    if (!fresh.length) return;

    const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    console.log(`[${now}] 命中 ${fresh.length} 条告警：` + fresh.map((x) => x.kind).join(' / '));

    const mailOn = cfg.email?.enabled && cfg.email?.authCode && cfg.email.authCode.length > 8;
    if (mailOn) {
      const { subject, html, text } = compose(s, fresh);
      await sendMail({
        host: cfg.email.smtpHost, port: cfg.email.smtpPort,
        user: cfg.email.user, pass: cfg.email.authCode, to: cfg.email.to,
        subject, html, text,
      });
      markSent(state, fresh);
      await mkdir('data', { recursive: true });
      await writeFile('data/alert-state.json', JSON.stringify(state, null, 1));
      lastAlertAt = Date.now();
      console.log(`  ✓ 已发邮件 → ${cfg.email.to}`);
    } else {
      console.log('  （邮箱未配置，仅记录；看板上仍会显示）');
      // 未配置邮箱时也做冷却，避免日志刷屏
      markSent(state, fresh);
      await mkdir('data', { recursive: true });
      await writeFile('data/alert-state.json', JSON.stringify(state, null, 1));
    }
  } catch (e) {
    console.error('[告警轮询失败]', e.message);
  }
}

// ---------- HTTP ----------
const server = createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];
  try {
    if (url === '/api/snapshot') {
      const data = await getSnapshot(req.url.includes('force=1'));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
      return;
    }
    if (url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, cachedAt: cache.at, lastAlertAt, emailOn: !!(cfg.email?.enabled && cfg.email?.authCode) }));
      return;
    }
    const file = path.join(ROOT, 'public', url === '/' ? 'index.html' : url);
    if (!path.resolve(file).startsWith(path.resolve(path.join(ROOT, 'public')))) {
      res.writeHead(403).end('forbidden'); return;
    }
    const buf = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(buf);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found: ' + url);
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`[研究台] http://127.0.0.1:${PORT}`);
  await loadConfig();
  tick();
  const poll = Math.max(15, (cfg.alerts?.pollSeconds ?? 60)) * 1000;
  setInterval(tick, poll);
  console.log(`[告警] 轮询间隔 ${poll / 1000}s · 邮箱${cfg.email?.enabled ? '已启用' : '未启用'}`);

  // 15 分钟多周期分析报告
  const mins = Math.max(5, cfg.alerts?.reportMinutes ?? 15);
  let n = 0;
  const scheduleReport = (delay = 60 * 1000) => setTimeout(async () => {
    try {
      // 事件窗口内必须每小时都推，不能因为"无变化"就跳过
      let w = null;
      try { w = eventWindow(await loadEvents(), new Date(), 24); } catch {}
      const r = await runReport({ send: true, force: n === 0 || !!w });
      console.log(`[报告] 第 ${++n} 封${r.sent ? ' 已发送' : ' 未发送'}${w ? ` · 事件窗口（${w.hours.toFixed(1)}h）` : ''}`);
    } catch (e) {
      console.error('[报告失败]', e.message);
    } finally {
      // 事件窗口（高影响事件前 24 小时）切换到小时级推送
      let next = mins;
      try {
        const w = eventWindow(await loadEvents(), new Date(), 24);
        if (w) {
          next = 60;
          console.log(`[事件窗口] ${w.event.name} 还有 ${w.hours.toFixed(1)}h → 切换为每小时推送`);
        }
      } catch {}
      scheduleReport(next * 60 * 1000); // 之后按设定间隔
    }
  }, delay);
  scheduleReport();
  console.log(`[报告] 每 ${mins} 分钟一封 · 启动 60 秒后发首封`);
});
