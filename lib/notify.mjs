// notify.mjs —— 把告警信号组装成一封"一眼能看完"的邮件
const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d));
const pct = (x) => (x == null ? '—' : (x >= 0 ? '+' : '') + Number(x).toFixed(2) + '%');

export function compose(s, signals) {
  const a = s.analysis;
  const top = signals[0];
  const dir = s.bias <= -0.3 ? '偏空' : s.bias >= 0.3 ? '偏多' : '震荡';
  const subject = `【黄金告警】${f(s.price)} ${top.title} | ${dir}`;

  const rows = signals.map((sg) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e8edf5;vertical-align:top;width:88px">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;
          background:${sg.severity === 'high' ? '#ffe8ea' : '#fff4e0'};color:${sg.severity === 'high' ? '#c81e2b' : '#a86800'}">
          ${sg.kind}
        </span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8edf5;vertical-align:top">
        <div style="font-weight:700;font-size:14px;color:#16233a;margin-bottom:3px">${sg.title}</div>
        <div style="font-size:13px;color:#4a5a72;line-height:1.6">${sg.detail}</div>
      </td>
    </tr>`).join('');

  const lv = (arr, color) => arr.slice(0, 4).map((c) =>
    `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;
      border-bottom:1px dashed #e8edf5">
      <span style="color:${color};font-weight:700">${f(c.p)}</span>
      <span style="color:#8496b0;font-size:12px">${pct((c.p / s.refPrice - 1) * 100)}</span>
    </div>`).join('');

  const tfRows = Object.values(s.tfs).map((t) => {
    const c = t.trend.includes('空') ? '#c81e2b' : t.trend.includes('多') ? '#0f9d6e' : '#6b7a90';
    return `<td style="padding:6px 8px;text-align:center;border-bottom:1px solid #eef2f8">
      <div style="font-size:11px;color:#8496b0">${t.label}</div>
      <div style="font-size:13px;font-weight:700;color:${c}">${t.trend}</div></td>`;
  }).join('');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,'Microsoft YaHei',sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:20px 12px">
    <div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f2">
      <div style="background:#0f1a2e;padding:18px 22px;color:#fff">
        <div style="font-size:12px;color:#8fa3c4;letter-spacing:1px;margin-bottom:6px">黄金研究台 · 告警</div>
        <div style="font-size:13px;color:#8fa3c4">${s.tsLocal}</div>
      </div>

      <div style="padding:20px 22px">
        <table style="width:100%;margin-bottom:16px"><tr>
          <td style="vertical-align:bottom">
            <div style="font-size:11px;color:#8496b0">现货 XAUUSD</div>
            <div style="font-size:34px;font-weight:800;color:#16233a;line-height:1.1">${f(s.price)}</div>
          </td>
          <td style="text-align:right;vertical-align:bottom">
            <div style="font-size:15px;font-weight:700;color:${s.dayChgPct >= 0 ? '#0f9d6e' : '#c81e2b'}">
              ${s.dayChg >= 0 ? '+' : ''}${f(s.dayChg)} (${pct(s.dayChgPct)})
            </div>
            <div style="font-size:12px;color:#8496b0;margin-top:4px">
              多周期 ${s.biasLabel} ${f(s.bias)}
            </div>
          </td>
        </tr></table>

        <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
          <tr><td colspan="4" style="font-size:12px;font-weight:700;color:#8496b0;padding-bottom:6px">多周期方向</td></tr>
          <tr>${tfRows}</tr>
        </table>

        <div style="font-size:12px;font-weight:700;color:#8496b0;margin-bottom:8px">触发原因</div>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #e8edf5;margin-bottom:18px">
          ${rows}
        </table>

        <table style="width:100%"><tr>
          <td style="width:50%;vertical-align:top;padding-right:14px">
            <div style="font-size:12px;font-weight:700;color:#c81e2b;margin-bottom:6px">上方阻力</div>
            ${lv(s.levels.resistance, '#c81e2b')}
          </td>
          <td style="width:50%;vertical-align:top;padding-left:14px">
            <div style="font-size:12px;font-weight:700;color:#0f9d6e;margin-bottom:6px">下方支撑</div>
            ${lv(s.levels.support, '#0f9d6e')}
          </td>
        </tr></table>
      </div>

      <div style="padding:14px 22px;background:#f8fafc;border-top:1px solid #e2e8f2;font-size:11px;color:#8496b0;line-height:1.7">
        日线 RSI ${f(a.rsi14, 1)} · ATR ${f(a.atr14)} · 年化波动 ${f(a.vol20, 1)}% ·
        距年内高 ${pct(a.fromYearHighPct)} · 距年内低 ${pct(a.fromYearLowPct)}<br>
        数据：gold-api 现货 / 东方财富 COMEX 日线与分时 / 新浪交叉校验<br>
        <b style="color:#a86800">本邮件为行情数据与规则的自动播报，不构成投资建议。杠杆交易可能损失全部本金。</b>
      </div>
    </div>
  </div></body></html>`;

  const text = [
    `【黄金告警】${s.tsLocal}`,
    `现货 ${f(s.price)}  当日 ${pct(s.dayChgPct)}  多周期 ${s.biasLabel} ${f(s.bias)}`,
    '',
    ...signals.map((sg) => `· [${sg.kind}] ${sg.title}\n  ${sg.detail}`),
    '',
    `上方阻力：${s.levels.resistance.slice(0, 4).map((c) => f(c.p)).join(' / ')}`,
    `下方支撑：${s.levels.support.slice(0, 4).map((c) => f(c.p)).join(' / ')}`,
    '',
    '本邮件为数据与规则的自动播报，不构成投资建议。',
  ].join('\n');

  return { subject, html, text };
}
