// diag.mjs —— 数据源连通性诊断（在 GitHub Actions 上跑，排查海外服务器能否访问各源）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const TESTS = [
  ['gold-api(现货)',   'https://api.gold-api.com/price/XAU', {}],
  ['东财K线',          'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=101.GC00Y&fields1=f1&fields2=f51,f52,f53,f54,f55&klt=101&lmt=2', { 'User-Agent': UA }],
  ['新浪行情',         'https://hq.sinajs.cn/list=hf_XAU', { 'User-Agent': UA, Referer: 'https://finance.sina.com.cn' }],
  ['CFTC持仓',         'https://www.cftc.gov/dea/futures/deacmxsf.htm', { 'User-Agent': UA }],
  ['美联储FOMC',       'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', { 'User-Agent': UA }],
  ['Binance PAXG',     'https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=1d&limit=2', {}],
  ['Yahoo Finance',    'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=5d', { 'User-Agent': UA }],
];

console.log('════ 数据源连通性诊断 ════');
console.log('运行环境：', process.platform, 'Node', process.version);
console.log('');

let okCount = 0;
for (const [name, url, headers] of TESTS) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000), redirect: 'follow' });
    const text = await res.text();
    const ms = Date.now() - t0;
    const good = res.ok && text.length > 10;
    if (good) okCount++;
    console.log(`${good ? '✓' : '✗'} ${name.padEnd(16)} HTTP ${res.status}  ${String(ms).padStart(5)}ms  ${text.length}B`);
  } catch (e) {
    console.log(`✗ ${name.padEnd(16)} 失败 ${String(Date.now() - t0).padStart(5)}ms  ${e.name}: ${String(e.message).slice(0, 60)}`);
  }
}

console.log('');
console.log(`结果：${okCount}/${TESTS.length} 个源可用`);
console.log('');
console.log('════ SMTP 连通性 ════');
try {
  const tls = await import('node:tls');
  await new Promise((resolve, reject) => {
    const s = tls.connect({ host: 'smtp.qq.com', port: 465, timeout: 8000 }, () => {
      console.log('✓ smtp.qq.com:465 可连接');
      s.destroy(); resolve();
    });
    s.on('error', (e) => reject(e));
    s.on('timeout', () => { s.destroy(); reject(new Error('超时')); });
  });
} catch (e) {
  console.log('✗ smtp.qq.com:465 连接失败：' + e.message);
}

console.log('');
console.log('════ 密钥是否注入 ════');
for (const k of ['DEEPSEEK_API_KEY', 'QQ_USER', 'QQ_AUTH_CODE', 'QQ_TO']) {
  const v = process.env[k];
  if (!v) { console.log(`✗ ${k.padEnd(18)} 缺失`); continue; }
  if (k === 'QQ_AUTH_CODE') {
    // 只打印首尾和长度，够判断填对没有，又不泄露全文
    console.log(`✓ ${k.padEnd(18)} 长度=${v.length}  掩码=${v.slice(0, 3)}****${v.slice(-2)}`);
    if (/\s/.test(v)) console.log('   ⚠ 值里含空格！这是最常见的失败原因');
    if (v.length !== 16) console.log('   ⚠ 长度不是 16，QQ 授权码通常是 16 位');
  } else {
    console.log(`✓ ${k.padEnd(18)} 已注入（长度 ${v.length}）`);
  }
}

// 诊断步骤本身永远不失败，避免掩盖真正的问题
process.exit(0);
