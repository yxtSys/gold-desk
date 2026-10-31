// alert-check.mjs —— 检查告警并（可选）发邮件
// 用法：
//   node scripts/alert-check.mjs                只检查，打印
//   node scripts/alert-check.mjs --preview      生成邮件预览 HTML
//   node scripts/alert-check.mjs --send         真的发（需要 config.json 填好授权码）
//   node scripts/alert-check.mjs --test-mail    发一封测试邮件
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildSnapshot } from '../lib/desk.mjs';
import { evaluate, filterByCooldown, markSent } from '../lib/rules.mjs';
import { compose } from '../lib/notify.mjs';
import { sendMail } from '../lib/mailer.mjs';

const args = process.argv.slice(2);
const has = (k) => args.includes('--' + k);

const cfg = JSON.parse(await readFile('config.json', 'utf8'));
await mkdir('data', { recursive: true });

let state = {};
try { state = JSON.parse(await readFile('data/alert-state.json', 'utf8')); } catch {}

const mailCfg = {
  host: cfg.email.smtpHost, port: cfg.email.smtpPort,
  user: cfg.email.user, pass: cfg.email.authCode, to: cfg.email.to,
};
const mailReady = cfg.email.enabled && cfg.email.authCode && cfg.email.authCode.length > 8;

// ---------- 测试邮件 ----------
if (has('test-mail')) {
  if (!mailReady) {
    console.log('✗ 邮箱还没配置好。请在 config.json 里填：');
    console.log('  email.user     = 你的QQ号@qq.com');
    console.log('  email.authCode = QQ邮箱的"授权码"（不是登录密码）');
    console.log('  email.to       = 收件地址');
    console.log('  email.enabled  = true');
    process.exit(1);
  }
  const s = await buildSnapshot();
  s.cfg = cfg.alerts;
  const sigs = evaluate(s).slice(0, 2);
  const { subject, html, text } = compose(s, sigs.length ? sigs : [{
    kind: '测试', severity: 'mid', title: '邮件通道连通性测试',
    detail: `这是黄金研究台发出的测试邮件。当前现货 ${s.price}，多周期 ${s.biasLabel}。`,
  }]);
  await sendMail({ ...mailCfg, subject: '[测试] ' + subject, html, text });
  console.log('✓ 测试邮件已发送到', cfg.email.to);
  process.exit(0);
}

// ---------- 正常检查 ----------
const t0 = Date.now();
const s = await buildSnapshot();
s.cfg = cfg.alerts;

const all = evaluate(s);
const fresh = filterByCooldown(all, state, cfg.alerts.cooldownHours ?? 4);

console.log(`[${s.tsLocal}] 现货 ${s.price}  当日 ${s.dayChgPct?.toFixed(2)}%  共振 ${s.biasLabel} ${s.bias.toFixed(2)}  (${Date.now() - t0}ms)`);
console.log(`命中 ${all.length} 条，冷却后待发 ${fresh.length} 条`);
for (const sg of all) {
  const hot = fresh.some((x) => x.key === sg.key);
  console.log(`  ${hot ? '●' : '○'} [${sg.kind}] ${sg.title}`);
  if (hot) console.log(`      ${sg.detail}`);
}

if (fresh.length && has('preview')) {
  const { subject, html } = compose(s, fresh);
  await writeFile('media/alert-preview.html', html, 'utf8');
  console.log(`\n预览已生成：media/alert-preview.html`);
  console.log(`邮件标题：${subject}`);
}

if (fresh.length && has('send')) {
  if (!mailReady) {
    console.log('\n✗ 未发送：config.json 里 email.enabled / authCode 未配置');
    process.exit(2);
  }
  const { subject, html, text } = compose(s, fresh);
  await sendMail({ ...mailCfg, subject, html, text });
  markSent(state, fresh);
  await writeFile('data/alert-state.json', JSON.stringify(state, null, 1));
  console.log(`\n✓ 已发送 ${fresh.length} 条告警到 ${cfg.email.to}`);
} else if (fresh.length) {
  console.log('\n（加 --send 才会真的发邮件；加 --preview 可生成预览）');
}
