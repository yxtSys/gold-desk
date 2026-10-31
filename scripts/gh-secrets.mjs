// gh-secrets.mjs —— 用 GitHub API 写入 Actions Secrets（用仓库公钥做 sealed box 加密）
// 用法：node scripts/gh-secrets.mjs
import { readFile } from 'node:fs/promises';
import sealedbox from 'tweetnacl-sealedbox-js';

const OWNER = 'yxtSys';
const REPO = 'gold-desk';

const token = (await readFile('.gh_token', 'utf8')).trim();
const cfg = JSON.parse(await readFile('config.json', 'utf8'));
const sec = JSON.parse(await readFile('secrets.json', 'utf8'));

const hdr = {
  Authorization: 'Bearer ' + token,
  'User-Agent': 'dsh-desk',
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

const pkRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/secrets/public-key`, { headers: hdr });
if (!pkRes.ok) { console.error('取公钥失败', pkRes.status, await pkRes.text()); process.exit(1); }
const pk = await pkRes.json();

async function putSecret(name, value) {
  if (!value) { console.log(`跳过 ${name}（本地没有值）`); return false; }
  const sealed = sealedbox.seal(Buffer.from(value, 'utf8'), Buffer.from(pk.key, 'base64'));
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/secrets/${name}`, {
    method: 'PUT',
    headers: { ...hdr, 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted_value: Buffer.from(sealed).toString('base64'), key_id: pk.key_id }),
  });
  console.log(`${res.status === 201 || res.status === 204 ? '✓' : '✗'} ${name}  HTTP ${res.status}  (值长度 ${value.length})`);
  return res.ok;
}

console.log('写入 Secrets：');
await putSecret('DEEPSEEK_API_KEY', sec.deepseek.apiKey);
await putSecret('QQ_USER', cfg.email.user);
await putSecret('QQ_AUTH_CODE', cfg.email.authCode);
await putSecret('QQ_TO', cfg.email.to);

// 校验
const list = await (await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/secrets`, { headers: hdr })).json();
console.log('\n当前仓库 Secrets：', (list.secrets || []).map((s) => s.name).join(', '));
