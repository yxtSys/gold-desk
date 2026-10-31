// setup-mail.mjs —— 交互式配置 QQ 邮箱（不需要手动改 JSON）
import { createInterface } from 'node:readline/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { sendMail } from '../lib/mailer.mjs';
import { buildSnapshot } from '../lib/desk.mjs';
import { evaluate } from '../lib/rules.mjs';
import { compose } from '../lib/notify.mjs';

const rl = createInterface({ input: process.stdin, output: process.stdout });

const line = (s = '') => console.log(s);
line('════════════════════════════════════════');
line('  黄金研究台 · 邮箱配置向导');
line('════════════════════════════════════════');
line('');
line('需要两样东西：');
line('  1. 你的 QQ 邮箱地址');
line('  2. 16 位「授权码」（不是登录密码！）');
line('');
line('授权码获取：mail.qq.com → 设置 → 账号 →');
line('  开启「IMAP/SMTP服务」→ 验证后会显示一串 16 位码');
line('');

const user = (await rl.question('① QQ 邮箱地址（例如 123456@qq.com）：')).trim();
if (!/^[^@\s]+@[^@\s]+$/.test(user)) {
  line('\n✗ 邮箱格式不对，退出。请重新运行。');
  process.exit(1);
}

const rawCode = (await rl.question('② 16 位授权码：')).trim();
const authCode = rawCode.replace(/[\s-]/g, '');
if (!/^[a-z0-9]{16}$/i.test(authCode)) {
  line(`\n⚠ 授权码通常是 16 位字母数字，你输入的是 ${authCode.length} 位。`);
  line('  仍然继续尝试（有些账号格式不同）…\n');
}

const to = (await rl.question(`③ 收件地址（直接回车 = 发给 ${user}）：`)).trim() || user;

line('\n正在验证通道，请稍候…\n');

const cfg = JSON.parse(await readFile('config.json', 'utf8'));
cfg.email = { ...cfg.email, enabled: true, user, authCode, to };

let ok = false;
try {
  const s = await buildSnapshot();
  s.cfg = cfg.alerts;
  const sigs = evaluate(s).slice(0, 2);
  const { subject, html, text } = compose(s, sigs.length ? sigs : [{
    kind: '测试', severity: 'mid', title: '邮件通道已连通',
    detail: `这是黄金研究台发出的测试邮件。当前现货 ${s.price}，多周期 ${s.biasLabel}。`,
  }]);
  await sendMail({
    host: cfg.email.smtpHost, port: cfg.email.smtpPort,
    user, pass: authCode, to, subject: '[测试] ' + subject, html, text,
  });
  ok = true;
} catch (e) {
  line('✗ 发送失败：' + e.message);
  line('');
  line('常见原因：');
  line('  · 授权码填错（复制时带了空格？要重新生成吗）');
  line('  · SMTP 服务没开启（去 mail.qq.com → 设置 → 账号里开）');
  line('  · 邮箱地址填错');
  line('');
}

await writeFile('config.json', JSON.stringify(cfg, null, 2));

if (ok) {
  line('════════════════════════════════════════');
  line('  ✓ 配置成功，测试邮件已发出');
  line(`  收件箱：${to}`);
  line('');
  line('  去邮箱看看，收到就说明通了。');
  line('  之后双击「启动研究台.bat」即可开始盯盘。');
  line('════════════════════════════════════════');
} else {
  line('配置已保存，但通道未验证通过。改好后再运行本向导即可。');
}
rl.close();
