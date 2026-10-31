// indicators.mjs —— 纯函数技术指标（不依赖任何库）

export const sma = (arr, n) => (arr.length < n ? null : arr.slice(-n).reduce((a, b) => a + b, 0) / n);

// RSI：Wilder 平滑（标准算法，别用简单均值代替）
export function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / n, al = loss / n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

// ATR：真实波幅的 Wilder 均值
export function atr(bars, n = 14) {
  if (bars.length < n + 1) return null;
  const tr = [];
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1].c;
    tr.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - p), Math.abs(bars[i].l - p)));
  }
  let a = tr.slice(0, n).reduce((x, y) => x + y, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

// 年化波动率（用近 n 日收益率标准差）
export function volatility(closes, n = 20) {
  if (closes.length < n + 1) return null;
  const rets = [];
  for (let i = closes.length - n; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}

// 年内高低点
export function yearRange(bars, year) {
  const y = bars.filter((b) => b.date >= `${year}-01-01`);
  if (!y.length) return null;
  const hi = y.reduce((a, b) => (b.h > a.h ? b : a));
  const lo = y.reduce((a, b) => (b.l < a.l ? b : a));
  return { high: hi.h, highDate: hi.date, low: lo.l, lowDate: lo.date };
}

// 近 n 日高低（做支撑/阻力）
export function swing(bars, n = 20) {
  const s = bars.slice(-n);
  if (!s.length) return null;
  return { high: Math.max(...s.map((b) => b.h)), low: Math.min(...s.map((b) => b.l)) };
}

// 一次性算全套
export function analyze(bars, now = new Date()) {
  const closes = bars.map((b) => b.c);
  const last = bars[bars.length - 1] || null;
  const price = last?.c ?? null;
  const ma5 = sma(closes, 5), ma20 = sma(closes, 20), ma60 = sma(closes, 60), ma120 = sma(closes, 120);
  const yr = yearRange(bars, now.getFullYear());
  const sw20 = swing(bars, 20);
  const r = rsi(closes), a = atr(bars), vol = volatility(closes);
  return {
    price, lastDate: last?.date ?? null,
    ma5, ma20, ma60, ma120,
    rsi14: r, atr14: a, vol20: vol,
    yearHigh: yr?.high ?? null, yearLow: yr?.low ?? null,
    yearHighDate: yr?.highDate ?? null, yearLowDate: yr?.lowDate ?? null,
    fromYearHighPct: price && yr?.high ? (price / yr.high - 1) * 100 : null,
    fromYearLowPct: price && yr?.low ? (price / yr.low - 1) * 100 : null,
    swing20High: sw20?.high ?? null, swing20Low: sw20?.low ?? null,
    ma20DevPct: price && ma20 ? (price / ma20 - 1) * 100 : null,
    ma60DevPct: price && ma60 ? (price / ma60 - 1) * 100 : null,
    ret20Pct: closes.length > 21 ? (closes.at(-1) / closes.at(-21) - 1) * 100 : null,
  };
}
