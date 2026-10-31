// test-window.mjs —— 事件窗口逻辑自测（不依赖真实日历）
import { eventWindow, upcoming, hoursUntil } from '../lib/events.mjs';

const mk = (hoursFromNow, name, impact = 'high') => ({
  name, impact, kind: 'TEST', bj: 'test',
  ts: new Date(Date.now() + hoursFromNow * 3600 * 1000),
});

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗', label); } };

console.log('事件窗口自测：');

// 12 小时后有事件 → 应在窗口内
{
  const evs = [mk(12, '测试非农')];
  const w = eventWindow(evs, new Date(), 24);
  ok(w !== null, '12h 后的事件被判为"在 24h 窗口内"');
  ok(w && w.event.name === '测试非农', '窗口返回正确的事件');
  ok(w && w.hours > 11 && w.hours < 13, `小时数正确（${w?.hours.toFixed(1)}h）`);
}

// 30 小时后 → 不在窗口
{
  const w = eventWindow([mk(30, '测试FOMC')], new Date(), 24);
  ok(w === null, '30h 后的事件不在窗口内');
}

// 已过去的事件 → 不算
{
  const w = eventWindow([mk(-5, '已过去')], new Date(), 24);
  ok(w === null, '已过去的事件被忽略');
}

// 多个事件时，取最近的那个
{
  const evs = [mk(20, '远的'), mk(5, '近的'), mk(40, '更远')];
  const w = eventWindow(evs, new Date(), 24);
  ok(w && w.event.name === '近的', '多个事件时取最近的一个');
}

// 低影响事件不该触发窗口
{
  const w = eventWindow([{ ...mk(3, '低影响'), impact: 'low' }], new Date(), 24);
  ok(w === null, '低影响事件不触发窗口');
}

// upcoming 排序
{
  const up = upcoming([mk(50, 'C'), mk(10, 'A'), mk(30, 'B')], new Date(), 3);
  ok(up.map((e) => e.name).join('') === 'ABC', 'upcoming 按时间升序');
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
