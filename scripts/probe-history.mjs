// probe-history.mjs —— 拉黄金日线，验证"全年新低"并算关键指标
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36';

async function emKline(secid, lmt = 420) {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
    `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57` +
    `&klt=101&fqt=1&beg=0&end=20500101&lmt=${lmt}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  const j = await res.json();
  const k = j?.data?.klines || [];
  return k.map((s) => {
    const [date, open, close, high, low, vol] = s.split(',');
    return { date, o: +open, c: +close, h: +high, l: +low, v: +vol };
  });
}

const naive = (arr, n) => arr.length < n ? null : arr.slice(-n).reduce((a, b) => a + b, 0) / n;
function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let gain = 0, loss = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  const rs = loss === 0 ? 100 : gain / loss * (100 / n) / (100 / n); // 简化
  const ag = gain / n, al = loss / n;
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}
function atr(bars, n = 14) {
  if (bars.length < n + 1) return null;
  let sum = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const p = bars[i - 1].c;
    sum += Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - p), Math.abs(bars[i].l - p));
  }
  return sum / n;
}

for (const [name, secid] of [['COMEX黄金', '101.GC00Y'], ['上海金Au9999', '118.AU9999']]) {
  try {
    const bars = await emKline(secid);
    if (!bars.length) { console.log(name, '无数据'); continue; }
    const closes = bars.map((b) => b.c);
    const last = bars[bars.length - 1];
    const ytd = bars.filter((b) => b.date >= '2026-01-01');
    const ytdLow = Math.min(...ytd.map((b) => b.l));
    const ytdHigh = Math.max(...ytd.map((b) => b.h));
    const ytdLowBar = ytd.find((b) => b.l === ytdLow);
    console.log(`\n===== ${name} =====`);
    console.log(`交易日数 ${bars.length}  区间 ${bars[0].date} ~ ${last.date}`);
    console.log(`最新收盘 ${last.c}  今日高低 ${last.h}/${last.l}`);
    console.log(`年初至今  最高 ${ytdHigh}   最低 ${ytdLow} (${ytdLowBar.date})`);
    console.log(`距年内低点 ${((last.c / ytdLow - 1) * 100).toFixed(2)}%   距年内高点 ${((last.c / ytdHigh - 1) * 100).toFixed(2)}%`);
    console.log(`MA5 ${naive(closes, 5)?.toFixed(2)}  MA20 ${naive(closes, 20)?.toFixed(2)}  MA60 ${naive(closes, 60)?.toFixed(2)}  MA120 ${naive(closes, 120)?.toFixed(2)}`);
    console.log(`RSI14 ${rsi(closes)?.toFixed(1)}   ATR14 ${atr(bars)?.toFixed(2)}`);
    const ret20 = closes.length > 21 ? (closes.at(-1) / closes.at(-21) - 1) * 100 : null;
    console.log(`近20日涨跌 ${ret20?.toFixed(2)}%`);
  } catch (e) {
    console.log(name, 'FAIL', e.message.slice(0, 80));
  }
}
