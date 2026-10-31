// snapshot.mjs —— 抓一次快照，打印研究台摘要并存 JSON
import { buildSnapshot } from '../lib/desk.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d));
const pct = (x) => (x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2) + '%');

await mkdir('data', { recursive: true });
const t0 = Date.now();
const s = await buildSnapshot();
await writeFile('data/snapshot.json', JSON.stringify(s, null, 1));

console.log('════════ 黄金研究台 · 快照 ════════');
console.log(`时间 ${s.tsLocal}   耗时 ${Date.now() - t0}ms`);
console.log(`现价 ${f(s.price)}   基差(现货 vs COMEX) ${f(s.basis)} (${pct(s.basisPct)})`);
console.log(`当日涨跌 ${f(s.dayChg)} (${pct(s.dayChgPct)})`);
console.log(`多周期共振 ${s.bias.toFixed(2)} → ${s.biasLabel}\n`);

console.log('── 周期矩阵 ──');
for (const [k, t] of Object.entries(s.tfs)) {
  console.log(`${t.label.padEnd(4)} ${t.trend.padEnd(4)} 价${f(t.price).padStart(8)}  MA20 ${f(t.ma20).padStart(8)}  MA60 ${f(t.ma60).padStart(8)}  RSI ${f(t.rsi14, 1).padStart(5)}  ATR ${f(t.atr14).padStart(6)}`);
}

const a = s.analysis;
console.log('\n── 日线状态 ──');
console.log(`年内高 ${f(a.yearHigh)} (${a.yearHighDate})   年内低 ${f(a.yearLow)} (${a.yearLowDate})`);
console.log(`距年内高 ${pct(a.fromYearHighPct)}   距年内低 ${pct(a.fromYearLowPct)}`);
console.log(`MA20 偏离 ${pct(a.ma20DevPct)}   MA60 偏离 ${pct(a.ma60DevPct)}   20日涨跌 ${pct(a.ret20Pct)}`);
console.log(`RSI14 ${f(a.rsi14, 1)}   ATR14 ${f(a.atr14)}   年化波动 ${f(a.vol20, 1)}%`);

console.log('\n── 关键位 ──');
console.log(`枢轴 P ${f(s.levels.pivots.P)}  R1 ${f(s.levels.pivots.R1)}  S1 ${f(s.levels.pivots.S1)}  R2 ${f(s.levels.pivots.R2)}  S2 ${f(s.levels.pivots.S2)}`);
console.log(`布林 上${f(s.levels.boll?.up)} 中${f(s.levels.boll?.mid)} 下${f(s.levels.boll?.dn)} (带宽${f(s.levels.boll?.widthPct, 1)}%)`);
if (s.levels.fib) console.log('斐波 ' + Object.entries(s.levels.fib).map(([k, v]) => `${k}:${f(v)}`).join('  '));

console.log('\n上方阻力(近→远): ' + s.levels.resistance.map((c) => `${f(c.p)}(${c.count})`).join('  '));
console.log('下方支撑(近→远): ' + s.levels.support.map((c) => `${f(c.p)}(${c.count})`).join('  '));

console.log('\n── 交叉校验 ──');
console.log(`新浪 XAU ${f(s.crossCheck.sinaXAU)}   GC ${f(s.crossCheck.sinaGC)}   上海金 ${f(s.crossCheck.sinaSGE)} 元/克`);
if (s.errors.length) console.log('⚠ 部分源失败: ' + s.errors.join(' | '));
console.log('\n已写入 data/snapshot.json');
