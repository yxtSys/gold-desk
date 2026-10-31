// probe-quotes.mjs —— 探测可用行情源（金价）
// 沙箱内 curl 的 TLS 有问题，统一用 Node fetch，并带上各站要求的 Referer/UA。
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const targets = [
  ['sina-hf_GC',   'https://hq.sinajs.cn/list=hf_GC',            { Referer: 'https://finance.sina.com.cn' }],
  ['sina-hf_XAU',  'https://hq.sinajs.cn/list=hf_XAU',           { Referer: 'https://finance.sina.com.cn' }],
  ['sina-AU9999',  'https://hq.sinajs.cn/list=gds_AUTD',         { Referer: 'https://finance.sina.com.cn' }],
  ['em-ComexGold', 'https://push2.eastmoney.com/api/qt/stock/get?secid=101.GC00Y&fields=f43,f44,f45,f46,f57,f58,f60,f169,f170', {}],
  ['em-SGE',       'https://push2.eastmoney.com/api/qt/stock/get?secid=118.AU9999&fields=f43,f44,f45,f46,f57,f58,f60,f169,f170', {}],
  ['tencent-hfGC', 'https://qt.gtimg.cn/q=hf_GC',                {}],
  ['jin10',        'https://data-api.jin10.com/data/1m?symbol=XAUUSD', {}],
  ['stooq-xauusd', 'https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv', {}],
];

for (const [name, url, extra] of targets) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': '*/*', ...extra },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
    });
    const txt = await res.text();
    const enc = /sinajs|gtimg/.test(name) ? new TextDecoder('gbk').decode(Buffer.from(txt, 'binary')) : txt;
    console.log(`${name.padEnd(14)} ${res.status} ${(Date.now() - t0).toString().padStart(5)}ms  ${txt.length}B  ${enc.replace(/\s+/g, ' ').slice(0, 110)}`);
  } catch (e) {
    console.log(`${name.padEnd(14)} FAIL ${((Date.now() - t0) / 1000).toFixed(1)}s ${e.name}: ${String(e.message).slice(0, 60)}`);
  }
}
