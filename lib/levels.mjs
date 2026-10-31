// levels.mjs —— 关键位计算（对齐知识库 key_levels.md 的口径）
// 结构位 / 枢轴 / 斐波那契 / 分型聚类 / 整数关口 / 布林带

export function pivots(bar) {
  const { h, l, c } = bar;
  const p = (h + l + c) / 3;
  return {
    P: p,
    R1: 2 * p - l, S1: 2 * p - h,
    R2: p + (h - l), S2: p - (h - l),
    R3: h + 2 * (p - l), S3: l - 2 * (h - p),
  };
}

// 分型：左右各 k 根都不超过它 → 顶/底分型（缠论里的分型同源）
export function fractals(bars, k = 2) {
  const highs = [], lows = [];
  for (let i = k; i < bars.length - k; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= k; j++) {
      if (bars[i].h <= bars[i - j].h || bars[i].h <= bars[i + j].h) isHigh = false;
      if (bars[i].l >= bars[i - j].l || bars[i].l >= bars[i + j].l) isLow = false;
    }
    if (isHigh) highs.push({ p: bars[i].h, i, date: bars[i].date });
    if (isLow) lows.push({ p: bars[i].l, i, date: bars[i].date });
  }
  return { highs, lows };
}

// 聚类：把相近的分型价位合并成一个"位"，统计触及次数
export function cluster(levels, tol = 8) {
  const sorted = levels.map((x) => (typeof x === 'number' ? { p: x } : x)).sort((a, b) => a.p - b.p);
  const out = [];
  for (const lv of sorted) {
    const last = out[out.length - 1];
    if (last && lv.p - last.hi <= tol) {
      last.items.push(lv);
      last.hi = Math.max(last.hi, lv.p);
      last.lo = Math.min(last.lo, lv.p);
      last.p = last.items.reduce((a, b) => a + b.p, 0) / last.items.length;
      last.count = last.items.length;
    } else {
      out.push({ p: lv.p, lo: lv.p, hi: lv.p, items: [lv], count: 1 });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

// 斐波那契回撤
export function fibo(low, high) {
  const d = high - low;
  return {
    '23.6%': high - d * 0.236,
    '38.2%': high - d * 0.382,
    '50.0%': high - d * 0.5,
    '61.8%': high - d * 0.618,
    '78.6%': high - d * 0.786,
  };
}

export function bollinger(closes, n = 20, k = 2) {
  if (closes.length < n) return null;
  const s = closes.slice(-n);
  const m = s.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / n);
  return { mid: m, up: m + k * sd, dn: m - k * sd, widthPct: ((2 * k * sd) / m) * 100 };
}

// 按当前价，把价位分成上方阻力 / 下方支撑（近→远）
export function splitByPrice(clusters, price) {
  const above = clusters.filter((c) => c.p > price).sort((a, b) => a.p - b.p);
  const below = clusters.filter((c) => c.p <= price).sort((a, b) => b.p - a.p);
  return { above, below };
}
