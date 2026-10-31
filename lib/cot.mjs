// cot.mjs —— CFTC COT 持仓报告解析（真实多空持仓，不是猜的情绪）
// 来源：cftc.gov/dea/futures/deacmxsf.htm —— COMEX 黄金，每周五公布上周二数据
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const URL = 'https://www.cftc.gov/dea/futures/deacmxsf.htm';

const num = (s) => Number(String(s).replace(/,/g, ''));

// 周频数据，没必要每 15 分钟抓一次；默认缓存 6 小时
export async function getCOT({ maxAgeHours = 6 } = {}) {
  try {
    const j = JSON.parse(await readFile('data/cot.json', 'utf8'));
    const age = (Date.now() - Date.parse(j.fetchedAt)) / 3600000;
    if (age < maxAgeHours) return j;
  } catch {}
  const fresh = await fetchCOT();
  await mkdir('data', { recursive: true });
  await writeFile('data/cot.json', JSON.stringify(fresh, null, 1));
  return fresh;
}

export async function fetchCOT() {
  const res = await fetch(URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('CFTC HTTP ' + res.status);
  const html = await res.text();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

  const gi = text.indexOf('GOLD - COMMODITY EXCHANGE INC.');
  if (gi < 0) throw new Error('未找到黄金区块');
  const seg = text.slice(gi, gi + 2500);

  const oi = seg.match(/OPEN INTEREST:\s*([\d,]+)/);
  const asOf = seg.match(/AS OF\s*(\d{2}\/\d{2}\/\d{2})/);

  // COMMITMENTS 后面那行 9 个数字：
  // 非商业多/空/套利 | 商业多/空 | 总多/总空 | 非报告多/空
  const cm = seg.match(/COMMITMENTS\s+([\d,\s]+?)\s+CHANGES/);
  if (!cm) throw new Error('未找到 COMMITMENTS 数据行');
  const nums = cm[1].trim().split(/\s+/).map(num);
  if (nums.length < 9) throw new Error('COMMITMENTS 字段数不足: ' + nums.length);

  // 周变化：CHANGES FROM 10/20/26 (CHANGE IN OPEN INTEREST: -5,469) 后面跟 9 个增量
  const ch = seg.match(/CHANGES FROM\s*(\d{2}\/\d{2}\/\d{2})\s*\(CHANGE IN OPEN INTEREST:\s*(-?[\d,]+)\)\s*((?:-?[\d,]+\s+){8}-?[\d,]+)/);
  let changes = null;
  if (ch) {
    const cn = ch[3].trim().split(/\s+/).map(num);
    changes = {
      from: ch[1],
      openInterest: num(ch[2]),
      ncLong: cn[0], ncShort: cn[1], ncSpread: cn[2],
      commLong: cn[3], commShort: cn[4],
      totalLong: cn[5], totalShort: cn[6],
      nrLong: cn[7], nrShort: cn[8],
    };
  }

  const [ncLong, ncShort, ncSpread, commLong, commShort, totalLong, totalShort, nrLong, nrShort] = nums;

  // 投机资金的净多与多空占比（这是"交易者的多空比"最接近的客观代理）
  const ncNet = ncLong - ncShort;
  const ncLongPct = ncLong + ncShort > 0 ? (ncLong / (ncLong + ncShort)) * 100 : null;

  // 商业盘天然反向：套保盘净空越大，说明生产商在大量抛套保
  const commNet = commLong - commShort;

  return {
    source: 'CFTC COT',
    url: URL,
    asOf: asOf ? asOf[1] : null,          // MM/DD/YY
    openInterest: oi ? num(oi[1]) : null,
    nonCommercial: { long: ncLong, short: ncShort, spread: ncSpread, net: ncNet, longPct: ncLongPct == null ? null : +ncLongPct.toFixed(1) },
    commercial: { long: commLong, short: commShort, net: commNet },
    total: { long: totalLong, short: totalShort },
    nonReportable: { long: nrLong, short: nrShort },
    changes,
    signal: ncLongPct == null ? null
      : ncLongPct >= 75 ? '投机盘极度偏多（拥挤多头）'
      : ncLongPct >= 60 ? '投机盘偏多'
      : ncLongPct <= 25 ? '投机盘极度偏空（拥挤空头）'
      : ncLongPct <= 40 ? '投机盘偏空'
      : '多空相对均衡',
    // 一周内的资金动向：净多变化 + 总持仓变化
    flow: changes ? {
      ncNetChange: changes.ncLong - changes.ncShort,
      oiChange: changes.openInterest,
      ncLongPctChange: null, // 由调用方按需计算
      label: (() => {
        const dn = changes.ncLong - changes.ncShort;
        const oi = changes.openInterest;
        if (dn < -5000 && oi < 0) return '多头平仓离场（减仓下行）';
        if (dn < -5000) return '多头大幅撤出';
        if (dn > 5000 && oi > 0) return '多头加仓进场（增仓上行）';
        if (dn > 5000) return '多头大幅涌入';
        if (Math.abs(dn) < 2000 && oi < -5000) return '仓位整体收缩，方向不明';
        return '仓位变动中性';
      })(),
    } : null,
    fetchedAt: new Date().toISOString(),
  };
}
