// sources.mjs —— 行情数据源
// 主口径：gold-api 现货 XAU（与知识库同源）+ Binance PAXG 历史K线（知识库原生口径）
// 交叉校验：新浪（hf_XAU / hf_GC）+ 东财
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const gbk = new TextDecoder('gbk');

export const SYMBOLS = [
  { id: 'XAU', name: '伦敦金现 XAUUSD', unit: 'USD/oz', digits: 2, sina: 'hf_XAU' },
  { id: 'GC',  name: 'COMEX 黄金',      unit: 'USD/oz', digits: 2, sina: 'hf_GC' },
  { id: 'SGE', name: '上海金 Au99.99',  unit: '元/克',  digits: 2, sina: 'gds_AUTD' },
];

// ---------- 现货锚点（知识库同源） ----------
export async function fetchSpot() {
  const res = await fetch('https://api.gold-api.com/price/XAU', { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('gold-api HTTP ' + res.status);
  const j = await res.json();
  return { price: j.price, updatedAt: j.updatedAt, source: 'gold-api' };
}

// ---------- Binance PAXG 历史K线（15 周期随便取） ----------
export async function fetchPaxg(interval = '1d', limit = 400) {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('binance HTTP ' + res.status);
  const rows = await res.json();
  return rows.map((r) => ({
    t: r[0],                       // 开盘时间(ms)
    date: new Date(r[0]).toISOString().slice(0, 16).replace('T', ' '),
    o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5],
  }));
}

// ---------- 新浪实时（交叉校验） ----------
export async function fetchSina() {
  const codes = SYMBOLS.map((s) => s.sina).join(',');
  const res = await fetch(`https://hq.sinajs.cn/list=${codes}`, {
    headers: { 'User-Agent': UA, Referer: 'https://finance.sina.com.cn' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error('sina HTTP ' + res.status);
  const text = gbk.decode(await res.arrayBuffer());
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/hq_str_(\w+)="([^"]*)"/);
    if (!m || !m[2]) continue;
    const f = m[2].split(',');
    const num = (i) => (f[i] === '' || f[i] === undefined ? null : Number(f[i]));
    out[m[1]] = { price: num(0), high: num(4), low: num(5), time: f[6], prevClose: num(7), open: num(8) };
  }
  return out;
}

// ---------- 东财 K线（COMEX 真期货，多周期；比 PAXG 代理可靠得多） ----------
// klt: 1/5/15/30/60 分钟线, 101 日线, 102 周线
export async function fetchKline(secid = '101.GC00Y', klt = 101, limit = 460) {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
    `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57` +
    `&klt=${klt}&fqt=1&beg=0&end=20500101&lmt=${limit}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('em HTTP ' + res.status);
  const j = await res.json();
  const rows = (j?.data?.klines || []).map((s) => {
    const p = s.split(',');
    return { date: p[0], o: +p[1], c: +p[2], h: +p[3], l: +p[4], v: +p[5] };
  });
  return rows.slice(-limit);
}

// 把低周期 K 线合成高周期（东财没有 4h，用 1h 合成）
export function resample(bars, n) {
  if (bars.length < n) return [];
  const out = [];
  const start = bars.length % n; // 让最后一组刚好收在最新一根
  for (let i = start; i + n <= bars.length; i += n) {
    const g = bars.slice(i, i + n);
    out.push({
      date: g[g.length - 1].date,
      o: g[0].o,
      h: Math.max(...g.map((x) => x.h)),
      l: Math.min(...g.map((x) => x.l)),
      c: g[g.length - 1].c,
      v: g.reduce((a, x) => a + x.v, 0),
    });
  }
  return out;
}
