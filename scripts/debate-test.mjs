// debate-test.mjs —— 跑一次多智能体推演，看输出质量
import { buildReport15 } from '../lib/report15.mjs';
import { runDebate } from '../lib/agents.mjs';

const r = await buildReport15();
const t0 = Date.now();
const d = await runDebate(r);

console.log('══════ 多空辩论 ══════');
console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s  总 tokens ${d.tokens}  模型 ${d.judge._model}\n`);

console.log('【多方分析师】');
(d.bull.points || []).forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
console.log(`  最强：${d.bull.strongest || '—'}\n`);

console.log('【空方分析师】');
(d.bear.points || []).forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
console.log(`  最强：${d.bear.strongest || '—'}\n`);

const j = d.judge;
console.log('【风控裁决】');
console.log(`  结论：${j.verdict}  置信度：${j.confidence}`);
console.log(`  理由：${j.reason}`);
console.log(`  盯住：${j.watch}`);
console.log(`  否决条件：${j.veto}`);
console.log('  情景：');
for (const s of j.scenarios || []) {
  console.log(`    ${s.name}: 触发 ${s.trigger} → 目标 ${s.target1} → 失效 ${s.invalid}`);
}
