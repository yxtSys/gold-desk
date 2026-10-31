// news.mjs —— 新闻聚合与多空情绪打分
// 原则：只统计"提到黄金相关"的条目，每个判断都能回溯到原文，不凭空造比例。
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 黄金相关：命中任意一个才算"与我们有关"
const RELEVANT = /黄金|金价|XAU|贵金属|金市|现货金|沪金|伦敦金|避险|美联储|加息|降息|CPI|通胀|非农|美元指数/;

// 情绪词典（权重可调；"跌"类词容易误判，所以只认组合语义更强的词）
const BULL = [
  ['避险', 1], ['突破', 1], ['反弹', 1], ['利多', 2], ['看多', 2], ['走强', 1],
  ['新高', 1], ['买盘', 1], ['降息', 2], ['衰退', 1], ['美元走弱', 2], ['美元下跌', 2],
  ['涨幅扩大', 2], ['企稳', 1], ['收复', 1], ['上破', 2],
];
const BEAR = [
  ['跌破', 2], ['利空', 2], ['看空', 2], ['走弱', 1], ['新低', 1], ['抛售', 1],
  ['加息', 2], ['鹰派', 2], ['美元走强', 2], ['美元上涨', 2], ['承压', 1],
  ['跌幅扩大', 2], ['下破', 2], ['失守', 2], ['跳水', 2], ['暴跌', 2],
];

function scoreText(text) {
  let bull = 0, bear = 0;
  const bullHit = [], bearHit = [];
  for (const [w, s] of BULL) if (text.includes(w)) { bull += s; bullHit.push(w); }
  for (const [w, s] of BEAR) if (text.includes(w)) { bear += s; bearHit.push(w); }
  return { bull, bear, net: bull - bear, bullHit, bearHit };
}

const strip = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const tsOf = (v) => {
  if (!v) return Date.now();
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(String(v).replace(' ', 'T'));
  return Number.isFinite(t) ? t : Date.now();
};

// ---------- 源 1：东方财富快讯 ----------
async function eastmoney() {
  const r = await fetch('https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_ajaxResult_50_1_.html',
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  const text = await r.text();                     // UTF-8，别当 GBK 解
  const m = text.match(/ajaxResult=(\{[\s\S]*\})/);
  if (!m) throw new Error('东财格式异常');
  const j = JSON.parse(m[1]);
  return (j.LivesList || []).map((it) => ({
    source: '东财快讯',
    ts: tsOf(it.showtime || it.time),
    title: strip(it.title),
    body: strip(it.digest || it.content || ''),
  }));
}

// ---------- 源 2：华尔街见闻 ----------
async function wallstcn(channel = 'global-channel') {
  const r = await fetch(`https://api-one.wallstcn.com/apiv1/content/lives?channel=${channel}&limit=50`,
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  return (j?.data?.items || []).map((it) => ({
    source: '华尔街见闻',
    ts: tsOf(it.display_time),
    title: strip(it.title || ''),
    body: strip(it.content_text || it.content || ''),
  }));
}

// ---------- 源 3：新浪财经滚动 ----------
async function sina() {
  const r = await fetch('https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2513&num=30&page=1',
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  return (j?.result?.data || []).map((it) => ({
    source: '新浪财经',
    ts: tsOf(it.ctime),
    title: strip(it.title),
    body: strip(it.intro || ''),
  }));
}

// 聚合 + 打分
// 数据现实：黄金专线的新闻在周末会断流（实测周六最新一条是 29 小时前）。
// 所以这里必须做"样本充足性判断"，样本不够就明说，绝不硬凑一个 50/50。
export async function collectSentiment({ hours = 48 } = {}) {
  const errors = [];
  const results = await Promise.allSettled([
    wallstcn('gold-channel'),
    wallstcn('global-channel'),
  ]);
  const all = [];
  const names = ['华尔街见闻(黄金)', '华尔街见闻(全球)'];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') all.push(...r.value);
    else errors.push(`${names[i]}: ${String(r.reason?.message || r.reason).slice(0, 60)}`);
  });

  const cutoff = Date.now() - hours * 3600 * 1000;
  const recent = all.filter((x) => x.ts >= cutoff);

  const relevant = recent
    .map((it) => {
      const text = (it.title + ' ' + it.body).slice(0, 400);
      return { ...it, text, ...scoreText(text) };
    })
    .filter((it) => RELEVANT.test(it.text));

  const bull = relevant.filter((x) => x.net > 0);
  const bear = relevant.filter((x) => x.net < 0);
  const flat = relevant.filter((x) => x.net === 0);

  const bullScore = relevant.reduce((s, x) => s + Math.max(0, x.net), 0);
  const bearScore = relevant.reduce((s, x) => s + Math.max(0, -x.net), 0);
  const total = bullScore + bearScore;
  const ratio = total > 0 ? (bullScore / total) * 100 : null;

  const bySource = {};
  for (const it of relevant) bySource[it.source] = (bySource[it.source] || 0) + 1;

  const newestTs = relevant.length ? Math.max(...relevant.map((x) => x.ts)) : null;
  const ageHours = newestTs ? (Date.now() - newestTs) / 3600000 : null;

  // 样本充足性：少于 5 条或最新一条超过 24 小时 → 认为不足以给比例
  const sufficient = relevant.length >= 5 && ageHours != null && ageHours <= 24;

  return {
    ts: new Date().toISOString(),
    hours,
    fetched: all.length,
    recent: recent.length,
    relevantCount: relevant.length,
    bullCount: bull.length,
    bearCount: bear.length,
    flatCount: flat.length,
    bullScore, bearScore,
    bullRatio: ratio == null ? null : +ratio.toFixed(1),
    bearRatio: ratio == null ? null : +(100 - ratio).toFixed(1),
    sufficient,
    ageHours: ageHours == null ? null : +ageHours.toFixed(1),
    verdict: !sufficient
      ? (relevant.length === 0 ? '无可用样本' : `样本不足（${relevant.length} 条，最新 ${ageHours?.toFixed(1)}h 前）`)
      : ratio >= 60 ? '偏多' : ratio <= 40 ? '偏空' : '分歧',
    bySource,
    errors,
    top: relevant
      .filter((x) => x.net !== 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, 6)
      .map((x) => ({ source: x.source, ts: x.ts, net: x.net, title: x.title || x.body.slice(0, 50), bullHit: x.bullHit, bearHit: x.bearHit })),
  };
}
