// micro.mjs —— 微观多周期分析（1m/2m/5m/10m/15m）
// 核心口径：EMA 5 / 25 / 55 三线排列 + 价格位置 + 近期交叉
import { getBars, resample } from './sources.mjs';
import { rsi, atr } from './indicators.mjs';

// EMA 序列（不是只取最后一个值，要能判断交叉）
export function emaSeries(values, n) {
  if (values.length < n) return null;
  const k = 2 / (n + 1);
  const out = new Array(values.length).fill(null);
  let prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// 最近一次 5/25 交叉（金叉=5上穿25）
function lastCross(e5, e25, lookback = 60) {
  if (!e5 || !e25) return null;
  const start = Math.max(1, e5.length - lookback);
  let last = null;
  for (let i = start; i < e5.length; i++) {
    if (e5[i] == null || e25[i] == null) continue;
    const prevDiff = e5[i - 1] != null && e25[i - 1] != null ? e5[i - 1] - e25[i - 1] : 0;
    const diff = e5[i] - e25[i];
    if (prevDiff <= 0 && diff > 0) last = { type: '金叉', barsAgo: e5.length - 1 - i };
    if (prevDiff >= 0 && diff < 0) last = { type: '死叉', barsAgo: e5.length - 1 - i };
  }
  return last;
}

export function analyzeTF(bars) {
  if (!bars || bars.length < 60) return null;
  const closes = bars.map((b) => b.c);
  const price = closes[closes.length - 1];
  const e5s = emaSeries(closes, 5), e25s = emaSeries(closes, 25), e55s = emaSeries(closes, 55);
  const e5 = e5s?.at(-1), e25 = e25s?.at(-1), e55 = e55s?.at(-1);

  // 三线排列
  let arrange = '交织';
  if (e5 != null && e25 != null && e55 != null) {
    if (e5 > e25 && e25 > e55) arrange = '多头排列';
    else if (e5 < e25 && e25 < e55) arrange = '空头排列';
  }

  // 价格在三线中的位置
  const above = [e5, e25, e55].filter((x) => x != null && price > x).length;

  // 结构：近 40 根的分型高低
  const seg = bars.slice(-40);
  let sh = -Infinity, sl = Infinity;
  for (let i = 2; i < seg.length - 2; i++) {
    if (seg[i].h > seg[i - 1].h && seg[i].h > seg[i + 1].h && seg[i].h > sh) sh = seg[i].h;
    if (seg[i].l < seg[i - 1].l && seg[i].l < seg[i + 1].l && seg[i].l < sl) sl = seg[i].l;
  }

  return {
    price, e5, e25, e55, arrange, above,
    cross: lastCross(e5s, e25s),
    rsi14: rsi(closes),
    atr14: atr(bars),
    atrPct: atr(bars) != null ? (atr(bars) / price) * 100 : null,
    swingHigh: Number.isFinite(sh) ? sh : null,
    swingLow: Number.isFinite(sl) ? sl : null,
    bars: bars.length,
  };
}

// 五个微观周期一起算
export async function buildMicro() {
  const [r1, r5, r15] = await Promise.all([
    getBars('1m', 1400),
    getBars('5m', 1200),
    getBars('15m', 600),
  ]);
  const m1 = r1.bars, m5 = r5.bars, m15 = r15.bars;
  const sources = { '1m': r1.source, '5m': r5.source, '15m': r15.source };
  const m2 = resample(m1, 2);
  const m10 = resample(m5, 2);

  const defs = [
    ['1m', '1分钟', m1, 1],
    ['2m', '2分钟', m2, 2],
    ['5m', '5分钟', m5, 5],
    ['10m', '10分钟', m10, 10],
    ['15m', '15分钟', m15, 15],
  ];

  const rows = [];
  for (const [id, label, bars, mins] of defs) {
    const a = analyzeTF(bars);
    if (!a) continue;
    rows.push({ id, label, mins, ...a });
  }
  rows.sources = sources;  // 记录每个周期实际用的源，便于排查
  return rows;
}

// 微观共振：按周期权重合成方向
export function microBias(rows) {
  const W = { '1m': 0.10, '2m': 0.15, '5m': 0.25, '10m': 0.20, '15m': 0.30 };
  let score = 0, wsum = 0;
  for (const r of rows) {
    let s = 0;
    if (r.arrange === '多头排列') s += 1;
    if (r.arrange === '空头排列') s -= 1;
    s += (r.above - 1.5) * 0.6;               // 价格在三线中的相对位置
    if (r.cross?.type === '金叉' && r.cross.barsAgo <= 10) s += 0.5;
    if (r.cross?.type === '死叉' && r.cross.barsAgo <= 10) s -= 0.5;
    const w = W[r.id] ?? 0.2;
    score += s * w; wsum += w;
  }
  const bias = wsum ? score / wsum : 0;
  return {
    bias,
    label: bias >= 0.9 ? '强多' : bias >= 0.3 ? '偏多' : bias <= -0.9 ? '强空' : bias <= -0.3 ? '偏空' : '震荡',
  };
}
