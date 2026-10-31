// news-check.mjs —— 多空情绪体检
import { collectSentiment } from '../lib/news.mjs';

const s = await collectSentiment({ hours: 48 });
const h = (ts) => new Date(ts).toLocaleString('zh-CN', { hour12: false });

console.log('════ 多空情绪聚合 ════');
console.log(`抓取 ${s.fetched} 条 | 48h 内 ${s.recent} 条 | 黄金相关 ${s.relevantCount} 条`);
console.log(`看多 ${s.bullCount} / 看空 ${s.bearCount} / 中性 ${s.flatCount}`);
console.log(`打分 多${s.bullScore} 空${s.bearScore}`);
console.log(`结论：${s.verdict}`);
if (s.sufficient) console.log(`多空比：${s.bullRatio}% / ${s.bearRatio}%`);
console.log(`最新一条：${s.ageHours} 小时前`);
console.log(`来源：${JSON.stringify(s.bySource)}`);
if (s.errors.length) console.log('错误：' + s.errors.join(' | '));

if (s.top.length) {
  console.log('\n信号最强的条目：');
  for (const t of s.top) {
    console.log(`  [${t.source}] ${h(t.ts)} net=${t.net}`);
    console.log(`    ${t.title.slice(0, 70)}`);
    if (t.bullHit.length || t.bearHit.length) console.log(`    命中词：${[...t.bullHit, ...t.bearHit].join(' ')}`);
  }
}
