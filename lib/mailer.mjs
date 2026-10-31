// mailer.mjs —— 零依赖 SMTP 客户端（QQ 邮箱专用）
// QQ 邮箱要求：smtp.qq.com:465 SSL + AUTH LOGIN，密码必须是"授权码"而不是登录密码。
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// 中文主题必须按 RFC2047 编码，否则会变乱码
function encodeHeader(s) {
  return /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

function b64Body(s, width = 76) {
  const b = Buffer.from(s, 'utf8').toString('base64');
  return b.match(new RegExp(`.{1,${width}}`, 'g')).join('\r\n');
}

export async function sendMail({ host = 'smtp.qq.com', port = 465, user, pass, to, subject, html, text }) {
  if (!user || !pass) throw new Error('缺少邮箱账号或授权码');
  if (!to) throw new Error('缺少收件人');

  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
  socket.setEncoding('utf8');

  let buf = '';
  const waiters = [];
  socket.on('data', (d) => {
    buf += d;
    for (let i = 0; i < waiters.length; i++) {
      if (waiters[i].test(buf)) { const w = waiters.splice(i, 1)[0]; w.resolve(buf); buf = ''; i--; }
    }
  });
  socket.on('error', (e) => waiters.forEach((w) => w.reject(e)));

  const readReply = (timeout = 20000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('SMTP 响应超时')), timeout);
    waiters.push({
      // 多行响应：250-xxx 续行，250 xxx 结束
      test: (b) => /^\d{3} /m.test(b.split('\r\n').filter(Boolean).at(-1) || ''),
      resolve: (v) => { clearTimeout(t); resolve(v); },
      reject: (e) => { clearTimeout(t); reject(e); },
    });
  });

  const send = (line) => new Promise((resolve, reject) => {
    socket.write(line + '\r\n', (e) => (e ? reject(e) : resolve()));
  });

  const cmd = async (line, expect = /^[23]/, label = '') => {
    await send(line);
    const r = await readReply();
    const code = r.trim().slice(0, 3);
    if (!expect.test(code)) throw new Error(`SMTP ${label || line.slice(0, 12)} 失败: ${r.trim().slice(0, 160)}`);
    return r;
  };

  try {
    await new Promise((res, rej) => { socket.once('secureConnect', res); socket.once('error', rej); });
    await readReply();                                   // 220 banner
    await cmd('EHLO gold-desk', /^2/, 'EHLO');

    await send('AUTH LOGIN');
    const a1 = await readReply();                        // 334
    if (!a1.startsWith('334')) throw new Error('AUTH LOGIN 不被支持: ' + a1.slice(0, 80));
    await cmd(b64(user), /^334/, 'AUTH-USER');
    await cmd(b64(pass), /^2/, 'AUTH-PASS');

    await cmd(`MAIL FROM:<${user}>`, /^2/, 'MAIL FROM');
    await cmd(`RCPT TO:<${to}>`, /^2/, 'RCPT TO');
    await cmd('DATA', /^354/, 'DATA');

    const boundary = 'b' + randomBytes(8).toString('hex');
    const plain = text || (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const body = [
      `From: "黄金研究台" <${user}>`,
      `To: <${to}>`,
      `Subject: ${encodeHeader(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${randomBytes(12).toString('hex')}@gold-desk>`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64Body(plain),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64Body(html || '<pre>' + plain + '</pre>'),
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    // DATA 阶段内容统一走一行发送，避免被当作命令
    await send(body.replace(/\r\n\./g, '\r\n..'));
    await cmd('.', /^2/, 'DATA-END');
    await send('QUIT').catch(() => {});
    socket.end();
    return { ok: true };
  } finally {
    setTimeout(() => { try { socket.destroy(); } catch {} }, 200);
  }
}
