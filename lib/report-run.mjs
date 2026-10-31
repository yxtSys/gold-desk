// report-run.mjs —— 报告执行器（CLI 与常驻服务共用）
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildReport15, renderHTML, renderText } from './report15.mjs';
import { sendMail } from './mailer.mjs';
import { runDebate } from './agents.mjs';

const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d));

// 只报"变了什么"，避免每 15 分钟一份雷同报告
export function diffState(p, c) {
  if (!p) return [];
  const out = [];
  if (p.microLabel !== c.microLabel) out.push(`微观方向：<b>${p.microLabel}</b> → <b>${c.microLabel}</b>`);
  if (p.bigLabel !== c.bigLabel) out.push(`大局方向：<b>${p.bigLabel}</b> → <b>${c.bigLabel}</b>`);
  for (const [id, cur] of Object.entries(c.rows)) {
    const old = p.rows?.[id];
    if (old && old.arrange !== cur.arrange) out.push(`${id} 排列：${old.arrange} → <b>${cur.arrange}</b>`);
  }
  if (p.resTop && c.resTop && Math.abs(p.resTop - c.resTop) > 3) out.push(`最近阻力：${f(p.resTop)} → <b>${f(c.resTop)}</b>`);
  if (p.supTop && c.supTop && Math.abs(p.supTop - c.supTop) > 3) out.push(`最近支撑：${f(p.supTop)} → <b>${f(c.supTop)}</b>`);
  if (p.price && c.price) {
    const d = (c.price / p.price - 1) * 100;
    if (Math.abs(d) >= 0.3) out.push(`价格变动 ${d >= 0 ? '+' : ''}${d.toFixed(2)}%（${f(p.price)} → ${f(c.price)}）`);
  }
  return out;
}

export async function runReport({ send = false, force = false, preview = false, quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };

  let cfg = {};
  try { cfg = JSON.parse(await readFile('config.json', 'utf8')); } catch {}
  await mkdir('data', { recursive: true });

  let prev = null;
  try { prev = JSON.parse(await readFile('data/report-state.json', 'utf8')); } catch {}

  const t0 = Date.now();
  const r = await buildReport15();
  r.changes = diffState(prev, r.state);

  log(`[${r.snap.tsLocal}] 现价 ${f(r.price)}  微观 ${r.micro.label} ${f(r.micro.bias)}  大局 ${r.big.label}  (${Date.now() - t0}ms)`);
  if (r.changes.length) log('变化：\n  ' + r.changes.map((c) => c.replace(/<[^>]+>/g, '')).join('\n  '));
  else log('无显著变化');

  // ---------- AI 多空辩论（按变化/间隔触发，控成本） ----------
  const count = (prev?.count ?? 0) + 1;
  const llmCfg = cfg.llm || {};
  let debate = null;
  if (llmCfg.enabled) {
    const every = Math.max(1, llmCfg.everyN || 4);
    const should = force || r.changes.length > 0 || count % every === 0;
    if (should) {
      try {
        const td = Date.now();
        debate = await runDebate(r);
        log(`AI 辩论 ${((Date.now() - td) / 1000).toFixed(1)}s ${debate.tokens} tokens → ${debate.judge.verdict}`);
      } catch (e) {
        log('AI 辩论失败：' + e.message);
      }
    } else {
      log(`本轮跳过 AI 辩论（第 ${count} 封，每 ${every} 封一次且无变化）`);
    }
  }
  r.debate = debate;
  r.state.count = count;

  const html = renderHTML(r);
  const text = renderText(r);

  if (preview) {
    await mkdir('media', { recursive: true });
    await writeFile('media/report15.html', html, 'utf8');
    log('预览：media/report15.html');
  }

  // 邮箱：环境变量优先（Actions Secrets），本地回退 config.json
  const envCode = process.env.QQ_AUTH_CODE;
  const mailCfg = {
    host: cfg.email?.smtpHost || 'smtp.qq.com',
    port: cfg.email?.smtpPort || 465,
    user: process.env.QQ_USER || cfg.email?.user,
    pass: envCode || cfg.email?.authCode,
    to: process.env.QQ_TO || cfg.email?.to,
  };
  const mailOn = !!(mailCfg.pass && String(mailCfg.pass).length > 8 && mailCfg.user && mailCfg.to)
    && (!!envCode || cfg.email?.enabled);
  // 没有历史状态（首次运行 / Actions 缓存丢失）时也要发一封
  const noChange = !!prev && !r.changes.length && !force;
  let sent = false;

  if (send && mailOn && !noChange) {
    await sendMail({ ...mailCfg, subject: r.subject, html, text });
    sent = true;
    log(`✓ 已发送 → ${mailCfg.to}\n  ${r.subject}`);
  } else if (send && !mailOn) {
    log('✗ 邮箱未配置，跳过发送');
  } else if (send && noChange) {
    log('本轮无变化，跳过发送');
  }

  await writeFile('data/report-state.json', JSON.stringify(r.state, null, 1));
  return { sent, report: r, subject: r.subject };
}
