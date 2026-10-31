// sources.mjs —— 行情数据源
// 主口径：gold-api 现货 XAU（与知识库同源）+ Binance PAXG 历史K线（知识库原生口径）
// 交叉校验：新浪（hf_XAU / hf_GC）+ 东财
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const gbk = new TextDecoder('gbk');
const SECID = '101.GC00Y'; // COMEX 黄金（东财口径）

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
  // 注意：Binance klines 单次上限 1000 根，传大了会直接 400
  const safeLimit = Math.min(Math.max(limit, 1), 1000);
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=${interval}&limit=${safeLimit}`;
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

// ---------- 多源 K 线（自动降级）----------
// 现实：东财会掐掉海外 IP（实测 GitHub 美国 runner 被 TLS 层断开）
//      Yahoo 在国内常被 403，但在海外正常
//      Binance PAXG 全球可用，但口径是代币价
// 顺序：东财(国内最优) → Yahoo(海外最优) → Binance(全球兜底)
const EM_KLT = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '1d': 101, '1w': 102 };
const YAHOO = { '1m': ['1m', '1d'], '5m': ['5m', '5d'], '15m': ['15m', '5d'], '30m': ['30m', '1mo'], '1h': ['60m', '3mo'], '1d': ['1d', '2y'], '1w': ['1wk', '5y'] };
const BINANCE = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '1d': '1d', '1w': '1w' };

async function emBars(kind, limit) {
  return fetchKline(SECID, EM_KLT[kind], limit);
}

async function yahooBars(kind, limit) {
  const [iv, range] = YAHOO[kind];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=${iv}&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('yahoo HTTP ' + res.status);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error('yahoo 无数据');
  const q = r.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.close[i] == null) continue;
    bars.push({
      t: r.timestamp[i] * 1000,
      date: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 16).replace('T', ' '),
      o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0,
    });
  }
  return bars.slice(-limit);
}

async function binanceBars(kind, limit) {
  const rows = await fetchPaxg(BINANCE[kind], limit);
  return rows;
}

export async function getBars(kind, limit = 500) {
  const errs = [];
  for (const [name, fn] of [['eastmoney', emBars], ['yahoo', yahooBars], ['binance', binanceBars]]) {
    try {
      const bars = await fn(kind, limit);
      if (bars && bars.length > 30) return { bars, source: name };
      errs.push(`${name}: 仅 ${bars?.length || 0} 根`);
    } catch (e) {
      errs.push(`${name}: ${String(e.message).slice(0, 40)}`);
    }
  }
  throw new Error(`[${kind}] 所有行情源失败 → ${errs.join(' | ')}`);
}
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
