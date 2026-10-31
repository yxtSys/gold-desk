// risk.mjs —— 1000x 杠杆下的仓位与止损计算器
// 只做算术，不做判断：你给净值、风险比例、止损距离，它算手数和有效杠杆。
import { readFile } from 'node:fs/promises';

export const DEFAULT_ACCOUNT = {
  equity: 1000,        // 账户净值（美元）
  riskPct: 1,          // 单笔最大风险占净值百分比（知识库铁律 ≤1%）
  maxLeverage: 20,     // 有效杠杆上限（知识库铁律 10-20x）
  contractOz: 100,     // 1 手 = 100 盎司（XAUUSD 标准合约）
};

export async function loadAccount() {
  try {
    const cfg = JSON.parse(await readFile('config.json', 'utf8'));
    return { ...DEFAULT_ACCOUNT, ...(cfg.account || {}) };
  } catch { return { ...DEFAULT_ACCOUNT }; }
}

/**
 * 计算一笔交易的风险结构
 * @param price 现价
 * @param stopDistance 止损距离（美元/盎司）
 * @param acct 账户参数
 */
export function calcRisk(price, stopDistance, acct) {
  if (!price || !stopDistance || stopDistance <= 0) return null;
  const riskAmount = acct.equity * (acct.riskPct / 100);      // 可承受亏损（美元）
  const sizeOz = riskAmount / stopDistance;                    // 反推可持仓盎司
  const lots = sizeOz / acct.contractOz;                       // 折合标准手
  const notional = sizeOz * price;                             // 名义价值
  const leverage = notional / acct.equity;                     // 有效杠杆
  return {
    riskAmount, sizeOz, lots, notional, leverage,
    lotDisplay: lots < 0.01 ? lots.toFixed(4) : lots.toFixed(3),
    okLeverage: leverage <= acct.maxLeverage,
    stopPct: (stopDistance / price) * 100,
  };
}

// 按 ATR 给三档止损（紧/标准/宽），每档都算好仓位
export function stopLadder(price, atr5m, acct) {
  if (!atr5m) return [];
  const tiers = [
    { name: '紧', mult: 1.0, note: '容易被噪音扫掉' },
    { name: '标准', mult: 1.5, note: '常用档位' },
    { name: '宽', mult: 2.5, note: '容错大，仓位小' },
  ];
  return tiers.map((t) => {
    const d = atr5m * t.mult;
    return { ...t, distance: d, ...(calcRisk(price, d, acct) || {}) };
  });
}
