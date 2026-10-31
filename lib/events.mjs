// events.mjs —— 事件日历读取与事件窗口判断
import { readFile } from 'node:fs/promises';

export async function loadEvents() {
  try {
    const j = JSON.parse(await readFile('data/events.json', 'utf8'));
    return (j.events || []).map((e) => ({ ...e, ts: new Date(e.utc) }));
  } catch { return []; }
}

export function upcoming(events, now = new Date(), limit = 5) {
  return events.filter((e) => e.ts > now).sort((a, b) => a.ts - b.ts).slice(0, limit);
}

export function hoursUntil(ts, now = new Date()) {
  return (ts - now) / 3600000;
}

// 距离最近一个高影响事件不足 N 小时 → 处于事件窗口
export function eventWindow(events, now = new Date(), hours = 24) {
  const next = events.filter((e) => e.impact === 'high' && e.ts > now).sort((a, b) => a.ts - b.ts)[0];
  if (!next) return null;
  const h = hoursUntil(next.ts, now);
  return h <= hours ? { event: next, hours: h } : null;
}

export function fmtEventLine(e, now = new Date()) {
  const h = hoursUntil(e.ts, now);
  const badge = h <= 24 ? '⚠️' : h <= 72 ? '·' : '·';
  return `${badge} ${e.bj}（${h.toFixed(1)}h后）${e.name}`;
}
