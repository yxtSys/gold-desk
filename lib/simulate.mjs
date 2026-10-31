// simulate.mjs —— 规则化"推演引擎"
// 结构模仿多智能体多空辩论：收集证据 → 多空对峙 → 三情景 → 结论 + 置信度 + 证伪条件
// 重要：这不是预测。它是把当前结构折算成"如果上破/下破/震荡分别意味着什么"。
const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d));

export function simulate({ micro, big, snap, price, resLevels, supLevels }) {
  const bull = [], bear = [], neutral = [];
  const a = big.analysis;
  const atr5 = micro.rows.find((r) => r.id === '5m')?.atr14 ?? a.atr14 / 10;

  // ---------- 证据收集 ----------
  const arrangeCount = { 多: 0, 空: 0, 交织: 0 };
  for (const r of micro.rows) {
    if (r.arrange === '多头排列') arrangeCount['多']++;
    else if (r.arrange === '空头排列') arrangeCount['空']++;
    else arrangeCount['交织']++;
  }

  // 看空证据
  if (arrangeCount['空'] >= 3) {
    bear.push({ w: 3, text: `${arrangeCount['空']}/5 个微观周期呈空头排列（EMA5<EMA25<EMA55），下跌结构完整` });
  }
  if (big.bias <= -1) {
    bear.push({ w: 3, text: `大局四周期共振 ${big.label}（${f(big.bias)}），趋势方向与微观一致` });
  }
  if (price < (a.ma20 ?? price)) {
    bear.push({ w: 2, text: `现价 ${f(price)} 位于日线 MA20 ${f(a.ma20)} 下方 ${f(Math.abs(a.ma20DevPct))}%` });
  }
  if (a.fromYearLowPct != null && a.fromYearLowPct < 1.5) {
    bear.push({ w: 2, text: `距年内低点仅 ${f(a.fromYearLowPct)}%，处于"创新低"状态——跌破后往往加速` });
  }
  if (micro.rows.filter((r) => r.cross?.type === '死叉' && r.cross.barsAgo <= 10).length >= 1) {
    bear.push({ w: 2, text: `近期出现 EMA5 下穿 EMA25 死叉，短线动能转弱` });
  }

  // 看多证据
  if (a.rsi14 != null && a.rsi14 < 30) {
    bull.push({ w: 2, text: `日线 RSI ${f(a.rsi14, 1)} 处于超卖区（<30），下跌动能存在衰竭可能` });
  }
  const m1 = micro.rows.find((r) => r.id === '1m');
  if (m1?.cross?.type === '金叉' && m1.cross.barsAgo <= 5) {
    bull.push({ w: 1, text: `1 分钟刚出现 EMA5 上穿 EMA25 金叉（${m1.cross.barsAgo} 根前），超短线有反抽` });
  }
  if (micro.rows.some((r) => r.above >= 2)) {
    bull.push({ w: 1, text: `有周期价格已站上部分 EMA，说明并非全面单边` });
  }
  if (a.fromYearHighPct != null && a.fromYearHighPct < -25) {
    bull.push({ w: 1, text: `已自年内高点回撤 ${f(a.fromYearHighPct)}%，中期跌幅巨大，存在技术性修复空间` });
  }

  // 中性 / 矛盾
  if (micro.bias * big.bias < 0) {
    neutral.push({ w: 2, text: `微观（${micro.label}）与大局（${big.label}）方向不一致——这是最容易两头挨打的局面` });
  }
  if (arrangeCount['交织'] >= 2) {
    neutral.push({ w: 1, text: `${arrangeCount['交织']} 个周期处于均线交织，方向未定` });
  }
  if (a.vol20 != null && a.vol20 > 20) {
    neutral.push({ w: 1, text: `年化波动率 ${f(a.vol20, 1)}%，波动放大期，止损容易被打穿` });
  }

  const bullScore = bull.reduce((s, x) => s + x.w, 0);
  const bearScore = bear.reduce((s, x) => s + x.w, 0);
  const neutralScore = neutral.reduce((s, x) => s + x.w, 0);
  const total = bullScore + bearScore + neutralScore || 1;

  // ---------- 三情景 ----------
  const rTop = resLevels[0]?.p ?? price + atr5 * 2;
  const sTop = supLevels[0]?.p ?? price - atr5 * 2;
  const range = rTop - sTop;

  const scenarios = [
    {
      name: '上破情景',
      trigger: rTop,
      direction: 'up',
      path: `价格站上 ${f(rTop)}（最近阻力）并站稳`,
      target1: rTop + atr5 * 2,
      target2: rTop + atr5 * 4,
      invalid: rTop - atr5 * 1.5,
      weight: +(bullScore / total).toFixed(2),
      note: '需要放量突破且回踩不破，否则是假突破',
    },
    {
      name: '下破情景',
      trigger: sTop,
      direction: 'down',
      path: `价格跌破 ${f(sTop)}（最近支撑）`,
      target1: sTop - atr5 * 2,
      target2: sTop - atr5 * 4,
      invalid: sTop + atr5 * 1.5,
      weight: +(bearScore / total).toFixed(2),
      note: '跌破后若快速收回，视为假破位',
    },
    {
      name: '震荡情景',
      trigger: null,
      direction: 'range',
      path: `价格维持在 ${f(sTop)} – ${f(rTop)} 区间（宽度 ${f(range)} 美元）`,
      target1: sTop + range * 0.5,
      target2: rTop,
      invalid: null,
      weight: +(neutralScore / total).toFixed(2),
      note: '区间内高抛低吸的赔率受制于区间宽度，破边即失效',
    },
  ].sort((x, y) => y.weight - x.weight);

  // ---------- 结论 ----------
  const verdictScore = bearScore - bullScore;
  let verdict, confidence, verdictColor;
  if (verdictScore >= 5) { verdict = '结构偏空'; confidence = '中高'; verdictColor = 'bear'; }
  else if (verdictScore >= 2) { verdict = '结构偏空（证据不够强）'; confidence = '中'; verdictColor = 'bear'; }
  else if (verdictScore <= -5) { verdict = '结构偏多'; confidence = '中高'; verdictColor = 'bull'; }
  else if (verdictScore <= -2) { verdict = '结构偏多（证据不够强）'; confidence = '中'; verdictColor = 'bull'; }
  else { verdict = '结构中性'; confidence = '低'; verdictColor = 'neutral'; }

  const top = scenarios[0];

  return {
    bull, bear, neutral,
    bullScore, bearScore, neutralScore,
    scenarios,
    verdict, confidence, verdictColor,
    headline: `${verdict}（${confidence}）· 权重最大情景：${top.name} ${(top.weight * 100).toFixed(0)}%`,
    caveat: '这是规则推演，不是价格预测。它只回答"当前证据更偏向哪一边、以及突破/跌破分别会走向哪里"。',
    atr5: atr5,
    rangeWidth: range,
  };
}
