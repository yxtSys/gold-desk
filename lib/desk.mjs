// desk.mjs —— 研究台核心：多源行情 + 多周期 + 关键位 + 指标合成快照
// 历史口径：东财 COMEX 黄金(101.GC00Y) —— 真期货，比 PAXG 代理可靠
// 实时口径：gold-api 现货 XAU，交叉校验用新浪/东财
import { fetchSpot, fetchSina, fetchKline, resample } from './sources.mjs';
import { analyze, sma, rsi, atr, volatility } from './indicators.mjs';
import { pivots, fractals, cluster, fibo, bollinger, splitByPrice } from './levels.mjs';

const SECID = '101.GC00Y';

const TFS = [
  { id: '1w', label: '周线',  weight: 0.15, load: () => fetchKline(SECID, 102, 320) },
  { id: '1d', label: '日线',  weight: 0.40, load: () => fetchKline(SECID, 101, 460) },
  { id: '2h', label: '2小时', weight: 0.25, load: async () => resample(await fetchKline(SECID, 30, 800), 4) },
  { id: '1h', label: '1小时', weight: 0.20, load: () => fetchKline(SECID, 60, 420) },
];

// 单周期视图：趋势由均线排列 + 价格位置决定
function tfView(bars) {
  const closes = bars.map((b) => b.c);
  const price = closes[closes.length - 1];
  const ma20 = sma(closes, 20), ma60 = sma(closes, 60), ma120 = sma(closes, 120);
  let score = 0;
  if (ma20 && ma60) score += ma20 > ma60 ? 1 : -1;
  if (ma20) score += price > ma20 ? 1 : -1;
  if (ma120) score += price > ma120 ? 0.5 : -0.5;
  const trend = score >= 1.2 ? '强多' : score >= 0.3 ? '偏多' : score <= -1.2 ? '强空' : score <= -0.3 ? '偏空' : '震荡';
  return {
    price, ma20, ma60, ma120, score, trend,
    rsi14: rsi(closes), atr14: atr(bars), vol20: volatility(closes),
    last: bars[bars.length - 1], bars,
  };
}

export async function buildSnapshot() {
  const errors = [];
  const safe = async (fn, fb) => { try { return await fn(); } catch (e) { errors.push(e.message); return fb; } };

  const [spot, sina] = await Promise.all([safe(fetchSpot, null), safe(fetchSina, {})]);

  const tfs = {};
  for (const t of TFS) {
    const bars = await safe(() => t.load(), []);
    if (bars.length > 30) tfs[t.id] = { id: t.id, label: t.label, weight: t.weight, ...tfView(bars) };
  }

  const daily = tfs['1d'];
  if (!daily) throw new Error('无法获取日线数据，研究台无法工作');

  const price = spot?.price ?? sina?.hf_XAU?.price ?? daily.price;
  const refPrice = daily.price; // 关键位来自日线序列，用同一口径判断上下方
  const now = new Date();
  const A = analyze(daily.bars, now);

  const prevBar = daily.bars[daily.bars.length - 2];
  const piv = pivots(prevBar);
  const fr = fractals(daily.bars, 2);
  const fr4 = tfs['2h'] ? fractals(tfs['2h'].bars, 2) : { highs: [], lows: [] };
  const boll = bollinger(daily.bars.map((b) => b.c), 20, 2);
  const fib = A.yearLow && A.yearHigh ? fibo(A.yearLow, A.yearHigh) : null;

  // 关键位池：分型 + 枢轴 + 斐波 + 年内高低 + 摆动 + 整数关口
  // 只用分型会在强趋势里出现"下方支撑全空"的盲区
  const candidates = [
    ...fr.highs.map((x) => x.p), ...fr.lows.map((x) => x.p),
    ...fr4.highs.map((x) => x.p), ...fr4.lows.map((x) => x.p),
    ...Object.values(piv),
    ...(fib ? Object.values(fib) : []),
    A.swing20High, A.swing20Low, A.yearHigh, A.yearLow,
    Math.floor(refPrice / 100) * 100, Math.ceil(refPrice / 100) * 100,
    Math.floor(refPrice / 500) * 500, Math.ceil(refPrice / 500) * 500,
  ].filter((v) => typeof v === 'number' && Number.isFinite(v));

  const clusters = cluster(candidates.map((p) => ({ p })), 8);
  const sw = splitByPrice(clusters, refPrice);

  // 多周期共振
  let score = 0, wsum = 0;
  for (const t of TFS) {
    const v = tfs[t.id];
    if (!v) continue;
    score += v.score * t.weight; wsum += t.weight;
  }
  const bias = wsum ? score / wsum : 0;
  const biasLabel = bias >= 1 ? '强多' : bias >= 0.3 ? '偏多' : bias <= -1 ? '强空' : bias <= -0.3 ? '偏空' : '震荡';

  // 当日涨跌（用日线最后两根，避免依赖实时源）
  const dayChg = daily.bars.length > 1 ? refPrice - daily.bars[daily.bars.length - 2].c : null;

  return {
    ts: now.toISOString(),
    tsLocal: now.toLocaleString('zh-CN', { hour12: false }),
    errors,
    price, refPrice, spot, sina,
    dayChg, dayChgPct: dayChg != null ? (dayChg / daily.bars[daily.bars.length - 2].c) * 100 : null,
    basis: spot ? spot.price - refPrice : null,
    basisPct: spot ? (spot.price / refPrice - 1) * 100 : null,
    bias, biasLabel,
    tfs: Object.fromEntries(Object.entries(tfs).map(([k, v]) => [k, { ...v, bars: v.bars.slice(-180) }])),
    analysis: A,
    levels: {
      pivots: piv, fib, boll,
      clusters: clusters.slice(0, 14),
      resistance: sw.above.slice(0, 6),
      support: sw.below.slice(0, 6),
      round: Math.round(price / 100) * 100,
    },
    crossCheck: {
      sinaXAU: sina?.hf_XAU?.price ?? null,
      sinaGC: sina?.hf_GC?.price ?? null,
      sinaSGE: sina?.gds_AUTD?.price ?? null,
    },
  };
}
