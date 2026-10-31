// micro-check.mjs —— 微观多周期体检（命令行）
import { buildMicro, microBias } from '../lib/micro.mjs';
import { loadAccount, stopLadder } from '../lib/risk.mjs';

const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d));

const t0 = Date.now();
const rows = await buildMicro();
const mb = microBias(rows);
const acct = await loadAccount();
const price = rows[0]?.price ?? null;

console.log('════ 微观多周期（EMA 5/25/55）════');
console.log(`现价 ${f(price)}   微观共振 ${mb.label} ${mb.bias.toFixed(2)}   耗时 ${Date.now() - t0}ms\n`);
console.log('周期     价格       EMA5      EMA25     EMA55     排列      价位置  RSI    交叉');
for (const r of rows) {
  const cross = r.cross ? `${r.cross.type}(${r.cross.barsAgo}根前)` : '—';
  console.log(
    `${r.label.padEnd(7)}${f(r.price).padStart(9)} ${f(r.e5).padStart(9)} ${f(r.e25).padStart(9)} ${f(r.e55).padStart(9)}  ${r.arrange.padEnd(6)}  ${r.above}/3  ${f(r.rsi14, 1).padStart(5)}  ${cross}`
  );
}

const a5 = rows.find((r) => r.id === '5m');
console.log('\n════ 1000x 风险阶梯（基于 5 分钟 ATR）════');
console.log(`账户净值 ${acct.equity}  单笔风险 ${acct.riskPct}%  杠杆上限 ${acct.maxLeverage}x  5m ATR ${f(a5?.atr14)}\n`);
console.log('档位   止损距离    风险金额   持仓(盎司)   标准手    名义价值     有效杠杆  合规');
for (const t of stopLadder(price, a5?.atr14, acct)) {
  console.log(
    `${t.name.padEnd(5)} ${f(t.distance).padStart(9)} ${f(t.riskAmount).padStart(10)} ${f(t.sizeOz, 2).padStart(11)} ${t.lotDisplay.padStart(9)} ${f(t.notional, 0).padStart(12)} ${f(t.leverage, 1).padStart(9)}x  ${t.okLeverage ? '✓' : '✗ 超限'}`
  );
}
