// agents.mjs —— 多智能体推演：多方分析师 / 空方分析师 / 风控裁决
// 三个 Agent 拿同一份真实数据，各自立论，最后由裁决者给出结论。
import { chatJSON } from './llm.mjs';

const f = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(d));

// 把行情压缩成给模型看的事实清单（控制 token，只喂必要信息）
export function buildBrief(r) {
  const { snap, micro, big, price, resLevels, supLevels, a8 = null } = r;
  const a = snap.analysis;
  return [
    `【黄金 GOLD】时间 ${snap.tsLocal}`,
    `现价 ${f(price)}，当日 ${f(snap.dayChg)} (${f(snap.dayChgPct)}%)，基差(现货-COMEX) ${f(snap.basisPct)}%`,
    '',
    '微观周期（EMA5/25/55）：',
    ...micro.rows.map((t) => `- ${t.label}: 价格${f(t.price)} EMA5=${f(t.e5)} EMA25=${f(t.e25)} EMA55=${f(t.e55)} ${t.arrange} 价格在${t.above}/3条线之上 RSI=${f(t.rsi14, 1)} ${t.cross ? `最近${t.cross.type}(${t.cross.barsAgo}根前)` : '无近期交叉'} ATR=${f(t.atr14)}`),
    '',
    '宏观周期：',
    ...Object.values(big.tfs).map((t) => `- ${t.label}: ${t.trend} 价${f(t.price)} MA20=${f(t.ma20)} MA60=${f(t.ma60)} RSI=${f(t.rsi14, 1)}`),
    '',
    `日线：RSI14=${f(a.rsi14, 1)} ATR=${f(a.atr14)} 年化波动=${f(a.vol20, 1)}%`,
    `年内高 ${f(a.yearHigh)}（${a.yearHighDate}）年内低 ${f(a.yearLow)}（${a.yearLowDate}）`,
    `距年内高 ${f(a.fromYearHighPct)}% 距年内低 ${f(a.fromYearLowPct)}% MA20偏离 ${f(a.ma20DevPct)}%`,
    '',
    '上方阻力（近→远）：' + resLevels.map((l) => `${f(l.p)}(${l.tag})`).join(' / '),
    '下方支撑（近→远）：' + supLevels.map((l) => `${l.p ? f(l.p) : ''}(${l.tag})`).join(' / '),
    '',
    `枢轴 P=${f(snap.levels.pivots.P)} R1=${f(snap.levels.pivots.R1)} S1=${f(snap.levels.pivots.S1)}`,
    a8 ? `布林 上${f(a8.up)} 中${f(a8.mid)} 下${f(a8.dn)}` : '',
  ].join('\n');
}

const COMMON = `你是黄金交易研究团队的一员。只依据给定数据做判断，禁止编造数据里没有的价格、事件或新闻。
用户使用高杠杆（平台名义上限1000x），但他自己的风控铁律是：单笔风险≤净值1%、有效杠杆≤20x、必须设服务器端硬止损。
不要说"建议买入/卖出"，只描述结构、条件、和失效点。`;

// 多方分析师
export function bullAgent(brief) {
  return chatJSON({
    messages: [
      { role: 'system', content: COMMON + '\n你的角色：多方分析师。只找支持上涨的证据，但必须引用具体数据，不得臆造。' },
      { role: 'user', content: `${brief}\n\n请输出 JSON：{"points":["最多4条看多理由，每条必须带具体数值"],"strongest":"你认为最强的一条"}` },
    ],
    temperature: 0.4,
    maxTokens: 700,
  });
}

// 空方分析师
export function bearAgent(brief) {
  return chatJSON({
    messages: [
      { role: 'system', content: COMMON + '\n你的角色：空方分析师。只找支持下跌的证据，但必须引用具体数据，不得臆造。' },
      { role: 'user', content: `${brief}\n\n请输出 JSON：{"points":["最多4条看空理由，每条必须带具体数值"],"strongest":"你认为最强的一条"}` },
    ],
    temperature: 0.4,
    maxTokens: 700,
  });
}

// 风控裁决
export function judgeAgent(brief, bull, bear) {
  return chatJSON({
    messages: [
      { role: 'system', content: COMMON + '\n你的角色：风控裁决官。你要读完多空双方论点，判断哪一方证据更硬，并给出可执行的情景与失效条件。' },
      {
        role: 'user',
        content: `${brief}

【多方论点】
${(bull.points || []).map((x, i) => `${i + 1}. ${x}`).join('\n')}

【空方论点】
${(bear.points || []).map((x, i) => `${i + 1}. ${x}`).join('\n')}

请输出 JSON：
{
 "verdict":"偏空|中性|偏多",
 "confidence":"低|中|高",
 "reason":"一句话说明你判给哪方、为什么",
 "scenarios":[{"name":"上破|下破|震荡","trigger":数字,"target1":数字,"invalid":数字}],
 "watch":"未来几小时最该盯的一件事",
 "veto":"如果风控要否决这个结论，会是因为什么"
}
其中 trigger/target1/invalid 必须是数字（美元/盎司），不要带单位。`,
      },
    ],
    temperature: 0.2,
    maxTokens: 900,
  });
}

// 完整辩论
export async function runDebate(r) {
  const brief = buildBrief(r);
  const [bull, bear] = await Promise.all([bullAgent(brief), bearAgent(brief)]);
  const judge = await judgeAgent(brief, bull, bear);
  const tokens = (bull._usage?.total_tokens || 0) + (bear._usage?.total_tokens || 0) + (judge._usage?.total_tokens || 0);
  return { bull, bear, judge, brief, tokens };
}
