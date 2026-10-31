// rules.mjs —— 告警规则引擎
// 原则：规则只描述"发生了什么"，不下"该买该卖"的结论。
// 所有阈值都在 config.json 里，由使用者自己定。
export function evaluate(s) {
  const out = [];
  const cfg = s.cfg || {};
  const a = s.analysis;
  const p = s.price;
  const push = (o) => out.push({ ts: Date.now(), price: p, ...o });

  // 1) 创年内新低 / 新高
  if (a.yearLow != null && p < a.yearLow) {
    push({
      key: `yearlow:${a.yearLow.toFixed(0)}`, kind: '创新低', severity: 'high',
      title: `跌破年内低点 ${a.yearLow.toFixed(1)}`,
      detail: `现货 ${p.toFixed(2)} 已跌破年内最低 ${a.yearLow.toFixed(2)}（${a.yearLowDate}），创出年内新低。距年内高点 ${a.fromYearHighPct.toFixed(2)}%。`,
    });
  }
  if (a.yearHigh != null && p > a.yearHigh) {
    push({
      key: `yearhigh:${a.yearHigh.toFixed(0)}`, kind: '创新高', severity: 'high',
      title: `突破年内高点 ${a.yearHigh.toFixed(1)}`,
      detail: `现货 ${p.toFixed(2)} 突破年内最高 ${a.yearHigh.toFixed(2)}（${a.yearHighDate}）。`,
    });
  }

  // 2) 单日大幅波动
  const dm = cfg.dayMovePct ?? 2;
  if (s.dayChgPct != null && Math.abs(s.dayChgPct) >= dm) {
    push({
      key: `daymove:${new Date().toISOString().slice(0, 10)}:${Math.sign(s.dayChgPct)}`,
      kind: '异动', severity: 'high',
      title: `${s.dayChgPct > 0 ? '暴涨' : '暴跌'} ${s.dayChgPct.toFixed(2)}%`,
      detail: `当日波动 ${s.dayChgPct.toFixed(2)}%（${s.dayChg > 0 ? '+' : ''}${s.dayChg.toFixed(2)} 美元），超过阈值 ${dm}%。`,
    });
  }

  // 3) RSI 极值
  const rl = cfg.rsiLow ?? 25, rh = cfg.rsiHigh ?? 75;
  if (a.rsi14 != null && a.rsi14 <= rl) {
    push({
      key: `rsi-low:${new Date().toISOString().slice(0, 10)}`, kind: '超卖', severity: 'mid',
      title: `日线 RSI ${a.rsi14.toFixed(1)} 进入超卖`,
      detail: `日线 RSI14 = ${a.rsi14.toFixed(1)}，低于阈值 ${rl}。1小时 RSI ${(s.tfs['1h']?.rsi14 ?? NaN).toFixed(1)}。超卖本身不是买入理由，只是"下跌动能可能衰竭"的提示。`,
    });
  }
  if (a.rsi14 != null && a.rsi14 >= rh) {
    push({
      key: `rsi-high:${new Date().toISOString().slice(0, 10)}`, kind: '超买', severity: 'mid',
      title: `日线 RSI ${a.rsi14.toFixed(1)} 进入超买`,
      detail: `日线 RSI14 = ${a.rsi14.toFixed(1)}，高于阈值 ${rh}。`,
    });
  }

  // 4) 逼近关键位（决策窗口）
  const near = cfg.nearPct ?? 0.35;
  const nearest = (list, label) => {
    let best = null;
    for (const lv of list) {
      const d = ((lv.p - p) / p) * 100;
      if (Math.abs(d) <= near && (!best || Math.abs(d) < Math.abs(best.d))) best = { ...lv, d, label };
    }
    return best;
  };
  const nRes = nearest(s.levels.resistance, '阻力');
  const nSup = nearest(s.levels.support, '支撑');
  for (const n of [nRes, nSup]) {
    if (!n) continue;
    push({
      key: `near:${n.label}:${n.p.toFixed(0)}:${new Date().toISOString().slice(0, 10)}`,
      kind: '临近关键位', severity: 'mid',
      title: `${n.label} ${n.p.toFixed(1)} 就在眼前（${n.d > 0 ? '+' : ''}${n.d.toFixed(2)}%）`,
      detail: `现价 ${p.toFixed(2)} 距${n.label} ${n.p.toFixed(1)}（触及 ${n.count} 次）仅 ${Math.abs(n.d).toFixed(2)}%。这是决策窗口：突破/受阻会决定接下来的方向。`,
    });
  }

  // 5) 均线偏离过大（回归风险）
  const md = cfg.maDevPct ?? 6;
  if (a.ma20DevPct != null && Math.abs(a.ma20DevPct) >= md) {
    push({
      key: `madev:${new Date().toISOString().slice(0, 10)}`, kind: '偏离', severity: 'mid',
      title: `价格偏离 MA20 ${a.ma20DevPct.toFixed(2)}%`,
      detail: `现价距 20 日均线 ${a.ma20DevPct.toFixed(2)}%，超过阈值 ${md}%，存在均值回归压力。`,
    });
  }

  // 6) 多周期共振方向
  if (s.bias <= -1.5) {
    push({
      key: `bias-short:${new Date().toISOString().slice(0, 10)}`, kind: '共振', severity: 'mid',
      title: `多周期共振强空 ${s.bias.toFixed(2)}`,
      detail: `周/日/2小时/1小时方向一致向下（${Object.values(s.tfs).map((t) => t.label + ':' + t.trend).join(' ')}）。趋势行情里逆势抄底是高危动作。`,
    });
  }
  if (s.bias >= 1.5) {
    push({
      key: `bias-long:${new Date().toISOString().slice(0, 10)}`, kind: '共振', severity: 'mid',
      title: `多周期共振强多 ${s.bias.toFixed(2)}`,
      detail: `多周期方向一致向上。`,
    });
  }

  return out;
}

// 冷却：同一个 key 在 N 小时内只发一次，避免邮箱被刷爆
export function filterByCooldown(signals, state, hours = 4) {
  const now = Date.now();
  const ms = hours * 3600 * 1000;
  return signals.filter((sg) => {
    const last = state[sg.key] || 0;
    return now - last > ms;
  });
}

export function markSent(state, signals) {
  const now = Date.now();
  for (const s of signals) state[s.key] = now;
  return state;
}
