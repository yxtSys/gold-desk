// build-calendar.mjs —— 构建事件日历
// 来源分级：官方页面（FOMC）/ 确定性规则（NFP）/ 人工补充（CPI 等）
import { writeFile, mkdir, readFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 美国夏令时：3月第二个周日 ~ 11月第一个周日
function isDST(y, m, d) {
  const nthSunday = (year, month, n) => {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const day = 1 + ((7 - first) % 7) + (n - 1) * 7;
    return day;
  };
  const start = nthSunday(y, 2, 2);   // 3月第2个周日
  const end = nthSunday(y, 10, 1);    // 11月第1个周日
  const cur = Date.UTC(y, m, d);
  const dStart = Date.UTC(y, 2, start);
  const dEnd = Date.UTC(y, 10, end);
  return cur >= dStart && cur < dEnd;
}

// 美东时间 → UTC
function etToUtc(y, m, d, hh, mm) {
  const offset = isDST(y, m, d) ? 4 : 5;   // EDT=UTC-4 / EST=UTC-5
  return new Date(Date.UTC(y, m, d, hh + offset, mm));
}

const fmtBJ = (utcDate) => {
  const bj = new Date(utcDate.getTime() + 8 * 3600 * 1000);
  return bj.toISOString().slice(0, 16).replace('T', ' ');
};

// ---------- 1. FOMC：抓美联储官网 ----------
async function fetchFOMC() {
  const res = await fetch('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('Fed HTTP ' + res.status);
  const html = await res.text();
  const marker = '2026 FOMC Meetings';
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('未找到 2026 会议区块');
  // 结束位置 = 下一个年份标题（否则会把相邻年份一起扫进来）
  const after = html.slice(i + marker.length);
  const next = after.match(/\b(20\d\d) FOMC Meetings\b/);
  const end = next ? i + marker.length + next.index : i + 30000;
  const seg = html.slice(i, end).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const re = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d+)-(\d+)(\*)?/g;
  const out = [];
  let m;
  while ((m = re.exec(seg))) {
    const month = MONTHS.indexOf(m[1]);
    const endDay = Number(m[3]);
    // FOMC 决议在第二天 14:00 ET
    const utc = etToUtc(2026, month, endDay, 14, 0);
    out.push({
      utc: utc.toISOString(),
      bj: fmtBJ(utc),
      name: 'FOMC 利率决议' + (m[4] ? '（含点阵图）' : ''),
      kind: 'FOMC',
      impact: 'high',
      source: 'federalreserve.gov/monetarypolicy/fomccalendars.htm',
      confidence: 'official',
    });
  }
  return out;
}

// ---------- 2. 非农：每月第一个周五 08:30 ET ----------
function buildNFP(year = 2026) {
  const out = [];
  for (let m = 0; m < 12; m++) {
    let d = 1;
    while (new Date(Date.UTC(year, m, d)).getUTCDay() !== 5) d++;   // 找第一个周五
    const utc = etToUtc(year, m, d, 8, 30);
    out.push({
      utc: utc.toISOString(),
      bj: fmtBJ(utc),
      name: '美国非农就业报告',
      kind: 'NFP',
      impact: 'high',
      source: '规则推算：每月第一个周五 08:30 ET',
      confidence: 'rule',
      note: '若遇美国假日可能顺延，请以 BLS 官网为准',
    });
  }
  return out;
}

// ---------- 3. 人工补充 ----------
async function loadManual() {
  try {
    const j = JSON.parse(await readFile('data/events-manual.json', 'utf8'));
    return (j.events || []).map((e) => {
      const utc = new Date(e.utc);
      return { ...e, bj: fmtBJ(utc), confidence: e.confidence || 'verified' };
    });
  } catch { return []; }
}

// ---------- 主流程 ----------
const events = [];
const errors = [];

try { events.push(...await fetchFOMC()); }
catch (e) { errors.push('FOMC: ' + e.message); events.push(...buildFOMCRelisted()); }

// 官网挂了时的兜底（2026 年已知日期，来源：官网抓取留档）
function buildFOMCRelisted() {
  const list = [[0, 28], [2, 18], [3, 29], [5, 17], [6, 29], [8, 16], [9, 28], [11, 9]];
  return list.map(([m, d]) => {
    const utc = etToUtc(2026, m, d, 14, 0);
    return {
      utc: utc.toISOString(), bj: fmtBJ(utc), name: 'FOMC 利率决议', kind: 'FOMC',
      impact: 'high', source: '官网抓取留档（2026-10-31）', confidence: 'official-cached',
    };
  });
}

events.push(...buildNFP(2026));
events.push(...await loadManual());

events.sort((a, b) => new Date(a.utc) - new Date(b.utc));

await mkdir('data', { recursive: true });
await writeFile('data/events.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  errors,
  events,
}, null, 1));

const now = new Date();
const upcoming = events.filter((e) => new Date(e.utc) > now).slice(0, 8);
const byKind = events.reduce((a, e) => { a[e.kind] = (a[e.kind] || 0) + 1; return a; }, {});
console.log(`[日历] 共 ${events.length} 条（${Object.entries(byKind).map(([k, v]) => k + ':' + v).join(' ')}），未来 ${upcoming.length} 条`);
if (errors.length) console.log('⚠ ' + errors.join(' | '));
console.log('\n未来事件（北京时间）：');
for (const e of upcoming) {
  const h = ((new Date(e.utc) - now) / 3600000).toFixed(1);
  console.log(`  ${e.bj}  ${e.kind.padEnd(5)} ${e.name.padEnd(18)} 还有 ${h.padStart(7)} 小时  [${e.confidence}]`);
}
