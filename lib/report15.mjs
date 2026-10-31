// report15.mjs —— 15 分钟多周期分析报告（邮件版）
import { buildMicro, microBias } from './micro.mjs';
import { buildSnapshot } from './desk.mjs';
import { loadAccount, stopLadder, calcRisk } from './risk.mjs';
import { simulate } from './simulate.mjs';
import { loadEvents, upcoming, eventWindow, hoursUntil } from './events.mjs';
import { getCOT } from './cot.mjs';

const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d));
const pct = (x) => (x == null ? '—' : (x >= 0 ? '+' : '') + Number(x).toFixed(2) + '%');

// 用事实描述结构（不下买卖结论）
function conclusion(micro, big, price) {
  const mb = micro.bias, bb = big.bias;
  const parts = [];
  if (mb <= -0.9 && bb <= -1) {
    parts.push('微观与大局<b>同向向下</b>：五个微观周期多数呈空头排列，日线级也处于下行趋势。这是趋势环境，反弹属于趋势内的修正。');
  } else if (mb <= -0.3 && bb <= -0.3) {
    parts.push('微观与大局<b>方向一致偏空</b>，但强度不足，属于弱势震荡。');
  } else if (mb >= 0.9 && bb >= 1) {
    parts.push('微观与大局<b>同向向上</b>，多头排列完整。');
  } else if (mb > 0 && bb < 0) {
    parts.push('微观<b>短线反弹</b>，但大局仍向下——这是典型的逆势反弹结构，反弹空间受制于上方关键位。');
  } else if (mb < 0 && bb > 0) {
    parts.push('微观<b>短线回落</b>，但大局仍向上——属于上升趋势中的回调。');
  } else {
    parts.push('微观与大局<b>方向不一致</b>，处于方向选择的混沌区。');
  }
  const a = micro.rows.find((r) => r.id === '5m');
  if (a?.e5 && a?.e25 && a?.e55) {
    parts.push(`5 分钟 EMA 为 ${f(a.e5)} / ${f(a.e25)} / ${f(a.e55)}，现价 ${f(price)} 位于三线${a.above === 0 ? '下方' : a.above === 3 ? '上方' : '之间'}。`);
  }
  return parts.join('');
}

export async function buildReport15() {
  const [rows, snap, acct] = await Promise.all([buildMicro(), buildSnapshot(), loadAccount()]);
  const micro = { rows, ...microBias(rows) };
  const price = rows[0]?.price ?? snap.price;
  const big = { bias: snap.bias, label: snap.biasLabel, tfs: snap.tfs, analysis: snap.analysis };
  const a5 = rows.find((r) => r.id === '5m');
  const ladder = stopLadder(price, a5?.atr14, acct);

  // 结构性价位：微观摆动 + 日线关键位
  const resLevels = [
    ...(a5?.swingHigh ? [{ p: a5.swingHigh, tag: '5m摆动高' }] : []),
    ...snap.levels.resistance.slice(0, 4).map((c) => ({ p: c.p, tag: `日线位(触及${c.count})` })),
  ].filter((x) => x.p > price).sort((x, y) => x.p - y.p).slice(0, 4);

  const supLevels = [
    ...(a5?.swingLow ? [{ p: a5.swingLow, tag: '5m摆动低' }] : []),
    ...snap.levels.support.slice(0, 4).map((c) => ({ p: c.p, tag: `日线位(触及${c.count})` })),
  ].filter((x) => x.p <= price).sort((x, y) => y.p - x.p).slice(0, 4);

  const state = {
    ts: new Date().toISOString(),
    price, microBias: micro.bias, microLabel: micro.label,
    bigBias: big.bias, bigLabel: big.label,
    rows: Object.fromEntries(rows.map((r) => [r.id, { arrange: r.arrange, above: r.above, rsi: +f(r.rsi14, 1) }])),
    resTop: resLevels[0]?.p ?? null,
    supTop: supLevels[0]?.p ?? null,
    verdict: null,
  };

  const sim = simulate({ micro, big, snap, price, resLevels, supLevels });
  state.verdict = sim.verdict;

  // 事件日历：未来事件与事件窗口
  const evAll = await loadEvents();
  const nowD = new Date();
  const evWindow = eventWindow(evAll, nowD, 24);
  const evNext = upcoming(evAll, nowD, 3);

  // 真实持仓（周频，带缓存）
  const cot = await getCOT().catch(() => null);

  const dir = micro.bias <= -0.3 ? '空' : micro.bias >= 0.3 ? '多' : '震';
  const subject = `【黄金·15分钟】${f(price)} ${micro.label}/${big.label} | 关键位 ${f(resLevels[0]?.p)}↑ ${f(supLevels[0]?.p)}↓`;

  return { subject, micro, big, snap, acct, price, ladder, resLevels, supLevels, state, conclusion: conclusion(micro, big, price), a5, sim, evNext, evWindow, cot };
}

export function renderHTML(r) {
  const { micro, big, snap, price, ladder, resLevels, supLevels, acct, a5 } = r;
  const chgColor = snap.dayChgPct >= 0 ? '#0f9d6e' : '#c81e2b';
  const sim = r.sim;

  const evRow = (e, color) => `<div style="padding:3px 0;font-size:11.5px;color:#4a5a72;line-height:1.55">
      <span style="color:${color};font-weight:700">·</span> ${e.text}</div>`;

  const scCard = (s) => {
    const col = s.direction === 'up' ? '#0f9d6e' : s.direction === 'down' ? '#c81e2b' : '#8496b0';
    const bg = s.direction === 'up' ? '#f0fbf7' : s.direction === 'down' ? '#fef4f5' : '#f8fafc';
    return `<td style="width:33.3%;vertical-align:top;padding:6px">
      <div style="background:${bg};border-radius:8px;padding:9px 10px;height:100%">
        <div style="font-size:11px;font-weight:700;color:${col};margin-bottom:4px">${s.name} · ${(s.weight * 100).toFixed(0)}%</div>
        <div style="font-size:10.5px;color:#4a5a72;line-height:1.55">
          ${s.trigger ? `触发 <b>${f(s.trigger)}</b><br>目标 ${f(s.target1)} / ${f(s.target2)}<br>失效 ${f(s.invalid)}` : `区间 ${f(s.target1)} – ${f(s.target2)}`}
        </div>
      </div></td>`;
  };

  const microRow = (t) => {
    const c = t.arrange === '空头排列' ? '#c81e2b' : t.arrange === '多头排列' ? '#0f9d6e' : '#8a97ab';
    const cross = t.cross ? `${t.cross.type}<span style="color:#9aa8bd;font-size:10px">${t.cross.barsAgo}根前</span>` : '—';
    return `<tr>
      <td style="padding:7px 6px;border-bottom:1px solid #eef2f8;font-size:12px;font-weight:700;color:#16233a">${t.label}</td>
      <td style="padding:7px 6px;border-bottom:1px solid #eef2f8;text-align:right;font-size:12px;font-variant-numeric:tabular-nums">${f(t.price)}</td>
      <td style="padding:7px 6px;border-bottom:1px solid #eef2f8;text-align:center;font-size:11px;color:${c};font-weight:700">${t.arrange}</td>
      <td style="padding:7px 6px;border-bottom:1px solid #eef2f8;text-align:center;font-size:11px;color:#4a5a72">${t.above}/3</td>
      <td style="padding:7px 6px;border-bottom:1px solid #eef2f8;text-align:right;font-size:11px;color:${t.rsi14 < 30 ? '#0f9d6e' : t.rsi14 > 70 ? '#c81e2b' : '#4a5a72'}">${f(t.rsi14, 1)}</td>
      <td style="padding:7px 6px;border-bottom:1px solid #eef2f8;text-align:right;font-size:11px;color:#6b7a90">${cross}</td>
    </tr>`;
  };

  const bigRow = (t) => {
    const c = t.trend.includes('空') ? '#c81e2b' : t.trend.includes('多') ? '#0f9d6e' : '#8a97ab';
    return `<td style="padding:6px 8px;text-align:center;border-bottom:1px solid #eef2f8;width:25%">
      <div style="font-size:10px;color:#8496b0">${t.label}</div>
      <div style="font-size:12px;font-weight:700;color:${c}">${t.trend}</div>
      <div style="font-size:10px;color:#9aa8bd">RSI ${f(t.rsi14, 0)}</div></td>`;
  };

  const lvRow = (l, color, dir) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed #eef2f8;font-size:12px">
      <span><b style="color:${color}">${f(l.p)}</b> <span style="color:#9aa8bd;font-size:10px">${l.tag}</span></span>
      <span style="color:#8496b0">${pct((l.p / price - 1) * 100)}</span></div>`;

  const ladderRow = (t) => `<tr>
      <td style="padding:6px;border-bottom:1px solid #eef2f8;font-size:12px;font-weight:700">${t.name}</td>
      <td style="padding:6px;border-bottom:1px solid #eef2f8;text-align:right;font-size:12px">${f(t.distance)}</td>
      <td style="padding:6px;border-bottom:1px solid #eef2f8;text-align:right;font-size:12px">$${f(t.riskAmount)}</td>
      <td style="padding:6px;border-bottom:1px solid #eef2f8;text-align:right;font-size:12px;font-weight:700">${t.lotDisplay}</td>
      <td style="padding:6px;border-bottom:1px solid #eef2f8;text-align:right;font-size:12px;color:${t.okLeverage ? '#0f9d6e' : '#c81e2b'}">${f(t.leverage, 1)}x</td>
    </tr>`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,'Microsoft YaHei',sans-serif">
<div style="max-width:680px;margin:0 auto;padding:18px 12px">
  <div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f2">

    <div style="background:#0f1a2e;padding:16px 22px;color:#fff">
      <div style="display:flex;justify-content:space-between">
        <div style="font-size:12px;color:#8fa3c4;letter-spacing:1px">GOLD · 15 分钟分析</div>
        <div style="font-size:12px;color:#8fa3c4">${snap.tsLocal}</div>
      </div>
      <div style="margin-top:10px;font-size:32px;font-weight:800;line-height:1">${f(price)}
        <span style="font-size:14px;font-weight:700;color:${chgColor};margin-left:8px">${snap.dayChg >= 0 ? '+' : ''}${f(snap.dayChg)} ${pct(snap.dayChgPct)}</span>
      </div>
      <div style="margin-top:8px;font-size:12px;color:#8fa3c4">
        微观 <b style="color:${micro.bias <= -0.3 ? '#ff8a94' : micro.bias >= 0.3 ? '#7bf0c4' : '#c8d4e4'}">${micro.label} ${f(micro.bias)}</b>
        &nbsp;·&nbsp;
        大局 <b style="color:${big.bias <= -0.3 ? '#ff8a94' : big.bias >= 0.3 ? '#7bf0c4' : '#c8d4e4'}">${big.label} ${f(big.bias)}</b>
      </div>
    </div>

    ${r.evWindow ? `<div style="padding:14px 22px 0">
      <div style="background:#fdecef;border:1px solid #f6c2ca;border-radius:8px;padding:11px 13px">
        <div style="font-size:12px;font-weight:700;color:#a01a28;margin-bottom:3px">
          ⚠️ 事件窗口 · ${r.evWindow.event.name}
        </div>
        <div style="font-size:11.5px;color:#7a2630;line-height:1.6">
          ${r.evWindow.hours.toFixed(1)} 小时后公布（北京时间 ${r.evWindow.event.bj}）。
          按知识库铁律：事件前应降杠杆或空仓，技术信号此时只用于定进场价，不用于定方向。
        </div>
      </div>
    </div>` : ''}

    ${r.evNext && r.evNext.length ? `<div style="padding:12px 22px 0">
      <div style="font-size:11px;color:#8496b0;line-height:1.9">
        <b style="color:#6b7a90">未来事件：</b>
        ${r.evNext.map((e) => `<span style="display:inline-block;margin-right:14px">${e.bj.slice(5)} ${e.name.replace('美国', '')} <span style="color:#9aa8bd">(${((e.ts - new Date()) / 3600000).toFixed(0)}h)</span></span>`).join('')}
      </div>
    </div>` : ''}

    <div style="padding:16px 22px 0;font-size:13px;line-height:1.75;color:#3a4a62">${r.conclusion}</div>

    ${r.changes && r.changes.length ? `<div style="padding:12px 22px 0">
      <div style="background:#fff8e6;border:1px solid #ffe0a3;border-radius:8px;padding:10px 12px">
        <div style="font-size:11px;font-weight:700;color:#a86800;margin-bottom:4px">⚡ 与上一份相比的变化</div>
        <div style="font-size:12px;color:#6b5a34;line-height:1.7">${r.changes.map((c) => '· ' + c).join('<br>')}</div>
      </div>
    </div>` : ''}

    <div style="padding:16px 22px 0">
      <div style="font-size:11px;font-weight:700;color:#8496b0;letter-spacing:.5px;margin-bottom:6px">推演 · 多空辩论<span style="font-weight:400;color:#b6c2d4">（规则引擎，零成本）</span></div>
      <div style="border:1px solid #e2e8f2;border-radius:10px;overflow:hidden">
        <div style="background:${sim.verdictColor === 'bear' ? '#2a1218' : sim.verdictColor === 'bull' ? '#0e2620' : '#161d29'};
          padding:11px 13px;color:#fff;font-size:13px;font-weight:700">
          ${sim.headline}
        </div>
        <div style="padding:11px 13px">
          <table style="width:100%"><tr>
            <td style="width:50%;vertical-align:top;padding-right:10px">
              <div style="font-size:10.5px;font-weight:700;color:#c81e2b;margin-bottom:3px">看空证据 ${sim.bearScore}</div>
              ${sim.bear.length ? sim.bear.map((e) => evRow(e, '#c81e2b')).join('') : '<div style="font-size:11px;color:#9aa8bd">暂无</div>'}
            </td>
            <td style="width:50%;vertical-align:top;padding-left:10px;border-left:1px solid #eef2f8">
              <div style="font-size:10.5px;font-weight:700;color:#0f9d6e;margin-bottom:3px">看多证据 ${sim.bullScore}</div>
              ${sim.bull.length ? sim.bull.map((e) => evRow(e, '#0f9d6e')).join('') : '<div style="font-size:11px;color:#9aa8bd">暂无</div>'}
            </td>
          </tr></table>
          ${sim.neutral.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #eef2f8">
            <div style="font-size:10.5px;font-weight:700;color:#8496b0;margin-bottom:3px">矛盾/中性 ${sim.neutralScore}</div>
            ${sim.neutral.map((e) => evRow(e, '#8496b0')).join('')}
          </div>` : ''}
        </div>
        <div style="padding:0 7px 7px">
          <table style="width:100%;border-collapse:collapse"><tr>${sim.scenarios.map(scCard).join('')}</tr></table>
        </div>
      </div>
      <div style="font-size:10px;color:#9aa8bd;padding:6px 2px 0;line-height:1.6">${sim.caveat}</div>
    </div>

    ${r.debate ? (() => {
      const d = r.debate, j = d.judge;
      const vc = j.verdict === '偏空' ? '#8a1a24' : j.verdict === '偏多' ? '#0b5c43' : '#39485e';
      const pt = (arr, color) => (arr || []).map((x) => `<div style="padding:3px 0;font-size:11.5px;color:#4a5a72;line-height:1.55">
          <span style="color:${color};font-weight:700">·</span> ${x}</div>`).join('');
      return `<div style="padding:16px 22px 0">
        <div style="font-size:11px;font-weight:700;color:#8496b0;letter-spacing:.5px;margin-bottom:6px">
          AI 多空辩论<span style="font-weight:400;color:#b6c2d4">（DeepSeek 三智能体 · ${d.tokens} tokens）</span>
        </div>
        <div style="border:1px solid #e2e8f2;border-radius:10px;overflow:hidden">
          <div style="background:${vc};padding:11px 13px;color:#fff;font-size:13px;font-weight:700">
            ${j.verdict} · 置信度 ${j.confidence}
          </div>
          <div style="padding:10px 13px;font-size:12px;color:#3a4a62;line-height:1.65;background:#fcfdff">${j.reason || ''}</div>
          <div style="padding:6px 13px 10px">
            <table style="width:100%"><tr>
              <td style="width:50%;vertical-align:top;padding-right:10px">
                <div style="font-size:10.5px;font-weight:700;color:#c81e2b;margin-bottom:3px">空方 ${d.bear.points?.length || 0} 条</div>
                ${pt(d.bear.points, '#c81e2b')}
              </td>
              <td style="width:50%;vertical-align:top;padding-left:10px;border-left:1px solid #eef2f8">
                <div style="font-size:10.5px;font-weight:700;color:#0f9d6e;margin-bottom:3px">多方 ${d.bull.points?.length || 0} 条</div>
                ${pt(d.bull.points, '#0f9d6e')}
              </td>
            </tr></table>
          </div>
          ${j.watch ? `<div style="padding:9px 13px;background:#f8fafc;border-top:1px solid #eef2f8;font-size:11.5px;color:#4a5a72;line-height:1.6">
            <b style="color:#16233a">盯住：</b>${j.watch}</div>` : ''}
          ${j.veto ? `<div style="padding:9px 13px;background:#fff8e6;border-top:1px solid #ffe0a3;font-size:11.5px;color:#6b5a34;line-height:1.6">
            <b style="color:#a86800">否决条件：</b>${j.veto}</div>` : ''}
        </div>
      </div>`;
    })() : ''}

    <div style="padding:16px 22px 0">
      <div style="font-size:11px;font-weight:700;color:#8496b0;letter-spacing:.5px;margin-bottom:6px">微观结构 · EMA 5 / 25 / 55</div>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#f8fafc">
          <th style="padding:6px;text-align:left;font-size:10px;color:#8496b0">周期</th>
          <th style="padding:6px;text-align:right;font-size:10px;color:#8496b0">现价</th>
          <th style="padding:6px;text-align:center;font-size:10px;color:#8496b0">排列</th>
          <th style="padding:6px;text-align:center;font-size:10px;color:#8496b0">价位置</th>
          <th style="padding:6px;text-align:right;font-size:10px;color:#8496b0">RSI</th>
          <th style="padding:6px;text-align:right;font-size:10px;color:#8496b0">交叉</th>
        </tr>
        ${micro.rows.map(microRow).join('')}
      </table>
    </div>

    <div style="padding:14px 22px 0">
      <div style="font-size:11px;font-weight:700;color:#8496b0;letter-spacing:.5px;margin-bottom:6px">大局观</div>
      <table style="width:100%;border-collapse:collapse"><tr>
        ${Object.values(big.tfs).map(bigRow).join('')}
      </tr></table>
    </div>

    ${r.cot ? (() => {
      const c = r.cot, nc = c.nonCommercial;
      const p = nc.longPct ?? 50;
      return `<div style="padding:14px 22px 0">
        <div style="font-size:11px;font-weight:700;color:#8496b0;letter-spacing:.5px;margin-bottom:6px">
          真实持仓 · CFTC COT<span style="font-weight:400;color:#b6c2d4">（截至 ${c.asOf}，每周五更新）</span>
        </div>
        <div style="border:1px solid #e2e8f2;border-radius:10px;padding:11px 13px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7a90;margin-bottom:5px">
            <span>投机盘（非商业）</span><span>净 ${nc.net >= 0 ? '+' : ''}${nc.net.toLocaleString()} 张</span>
          </div>
          <div style="height:14px;border-radius:7px;overflow:hidden;display:flex;background:#eef2f8">
            <div style="width:${p.toFixed(1)}%;background:#0f9d6e"></div>
            <div style="width:${(100 - p).toFixed(1)}%;background:#c81e2b"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-top:3px">
            <span style="color:#0f9d6e;font-weight:700">多 ${nc.long.toLocaleString()}（${p.toFixed(1)}%）</span>
            <span style="color:#c81e2b;font-weight:700">空 ${nc.short.toLocaleString()}（${(100 - p).toFixed(1)}%）</span>
          </div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #eef2f8;font-size:11.5px;color:#4a5a72;line-height:1.6">
            商业套保盘 净 ${c.commercial.net.toLocaleString()} 张 · 总持仓 ${c.openInterest?.toLocaleString()} 张<br>
            ${c.changes ? `周变化（较 ${c.changes.from}）：投机多 <b style="color:${c.changes.ncLong < 0 ? '#c81e2b' : '#0f9d6e'}">${c.changes.ncLong > 0 ? '+' : ''}${c.changes.ncLong.toLocaleString()}</b> /
              空 <b style="color:${c.changes.ncShort > 0 ? '#c81e2b' : '#0f9d6e'}">${c.changes.ncShort > 0 ? '+' : ''}${c.changes.ncShort.toLocaleString()}</b> ·
              总持仓 <b>${c.changes.openInterest > 0 ? '+' : ''}${c.changes.openInterest.toLocaleString()}</b><br>` : ''}
            <b style="color:#a86800">${c.signal}</b>${c.flow ? ` · <b style="color:#6b5a34">${c.flow.label}</b>` : ''}
          </div>
        </div>
      </div>`;
    })() : ''}

    <div style="padding:14px 22px 0">
      <table style="width:100%"><tr>
        <td style="width:50%;vertical-align:top;padding-right:12px">
          <div style="font-size:11px;font-weight:700;color:#c81e2b;margin-bottom:4px">上方阻力</div>
          ${resLevels.map((l) => lvRow(l, '#c81e2b')).join('')}
        </td>
        <td style="width:50%;vertical-align:top;padding-left:12px">
          <div style="font-size:11px;font-weight:700;color:#0f9d6e;margin-bottom:4px">下方支撑</div>
          ${supLevels.map((l) => lvRow(l, '#0f9d6e')).join('')}
        </td>
      </tr></table>
    </div>

    <div style="padding:14px 22px 0">
      <div style="font-size:11px;font-weight:700;color:#8496b0;letter-spacing:.5px;margin-bottom:4px">
        风险阶梯 · 净值 $${acct.equity} · 单笔 ${acct.riskPct}% · 5m ATR ${f(a5?.atr14)}
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#f8fafc">
          <th style="padding:5px;text-align:left;font-size:10px;color:#8496b0">档位</th>
          <th style="padding:5px;text-align:right;font-size:10px;color:#8496b0">止损$</th>
          <th style="padding:5px;text-align:right;font-size:10px;color:#8496b0">风险$</th>
          <th style="padding:5px;text-align:right;font-size:10px;color:#8496b0">标准手</th>
          <th style="padding:5px;text-align:right;font-size:10px;color:#8496b0">杠杆</th>
        </tr>
        ${ladder.map(ladderRow).join('')}
      </table>
      <div style="font-size:10px;color:#9aa8bd;padding:6px 0 0">
        名义合约 1 手 = 100 盎司。有效杠杆 = 名义价值 / 净值，知识库铁律上限 ${acct.maxLeverage}x。
      </div>
    </div>

    <div style="padding:14px 22px;margin-top:12px;background:#f8fafc;border-top:1px solid #e2e8f2;font-size:10.5px;color:#8496b0;line-height:1.7">
      日线 RSI ${f(big.analysis.rsi14, 1)} · ATR ${f(big.analysis.atr14)} · 距年内高 ${pct(big.analysis.fromYearHighPct)} · 距年内低 ${pct(big.analysis.fromYearLowPct)}<br>
      数据：gold-api 现货 · 东方财富 COMEX 1/5/15/30/60 分钟与日线 · 新浪交叉校验<br>
      <b style="color:#a86800">本邮件为规则化行情分析，不构成投资建议。杠杆交易可能损失全部本金。</b>
    </div>
  </div>
</div></body></html>`;
}

export function renderText(r) {
  const { micro, big, price, ladder, resLevels, supLevels } = r;
  return [
    `【黄金·15分钟】${r.snap.tsLocal}`,
    `现价 ${f(price)}  当日 ${pct(r.snap.dayChgPct)}`,
    `微观 ${micro.label} ${f(micro.bias)} | 大局 ${big.label} ${f(big.bias)}`,
    '',
    ...micro.rows.map((t) => `${t.label}: ${t.arrange} 价位置${t.above}/3 RSI ${f(t.rsi14, 1)} ${t.cross ? t.cross.type : ''}`),
    '',
    `阻力: ${resLevels.map((l) => f(l.p)).join(' / ')}`,
    `支撑: ${supLevels.map((l) => f(l.p)).join(' / ')}`,
    '',
    ...ladder.map((t) => `${t.name}止损 ${f(t.distance)}$ → ${t.lotDisplay} 手 (${f(t.leverage, 1)}x)`),
    '',
    '本邮件为规则化行情分析，不构成投资建议。',
  ].join('\n');
}
