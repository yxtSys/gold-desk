# 黄金研究台

本地运行的黄金行情研究台 + 告警推送。盯着 COMEX 黄金与现货 XAU，按你知识库里的框架算关键位、
多周期方向和技术状态，命中条件就发到 QQ 邮箱。

## 真实持仓（CFTC COT）

比"新闻情绪"可靠得多——这是交易所实际登记的投机盘与套保盘持仓。

```bash
node -e "import('./lib/cot.mjs').then(async m=>console.log(await m.fetchCOT()))"
```

| 字段 | 含义 |
|---|---|
| 非商业（投机盘） | 基金/投机资金的多空，**这是最接近"交易者多空比"的客观数据** |
| 商业（套保盘） | 矿商/精炼商的对冲，天然反向 |
| 总持仓 / 周变化 | 市场参与度与资金流向 |

数据每周五公布（截至上周二），代码里缓存 6 小时。
**判读要点**：投机盘多空占比 ≥75% 属"拥挤多头"，≤25% 属"拥挤空头"——拥挤方向往往是反向出清的风险源。

## 新闻情绪（辅助，非主力）

`lib/news.mjs` 会抓华尔街见闻与东财快讯做关键词情绪打分。但实测结论：

- 泛财经源几乎不提黄金，命中率极低
- "黄金频道"实际是各国 CPI 数据播报，不是交易者观点
- 周末新闻断流

所以它**只作为辅助**，并且内置了"样本充足性判断"：少于 5 条或最新一条超过 24 小时，
直接输出"样本不足"，**不会硬凑一个 50/50 的假比例**。

## 事件日历

```bash
node scripts/build-calendar.mjs
```

生成 `data/events.json`，来源分级：

| 事件 | 来源 | 可信度 |
|---|---|---|
| FOMC 利率决议（8 次/年） | 美联储官网实时抓取 | `official` |
| 美国非农就业报告（12 次/年） | 规则推算：每月第一个周五 08:30 ET | `rule` |
| CPI 等 | 暂无权威源（BLS 官网 403 封锁） | 待补 |

**事件窗口自动切换节奏**：距离高影响事件不足 24 小时，报告从每 15 分钟自动切到**每小时**，
并在邮件顶部显示红色警示条。这是知识库 `playbook.md` 的铁律——事件压倒技术面。

> 手动补充事件：编辑 `data/events-manual.json`，格式
> `{"events":[{"utc":"2026-11-15T13:30:00Z","name":"美国 CPI","kind":"CPI","impact":"high","confidence":"verified"}]}`，
> 再跑一次 `build-calendar.mjs` 即可合并。

## 15 分钟多周期分析报告

服务启动 60 秒后发第一封，之后每 15 分钟一次（`config.json` → `alerts.reportMinutes`）。

**核心逻辑：只在结构变化时发信。** 如果微观/大局方向、某周期 EMA 排列、最近阻力支撑都没变，
就跳过这一封，避免每 15 分钟一封雷同邮件。想强制发用 `--force`。

```bash
node scripts/report15.mjs --preview   # 生成预览到 media/report15.html
node scripts/report15.mjs --send      # 只在有变化时发
node scripts/report15.mjs --send --force   # 强制发一封
```

报告包含：

| 区块 | 内容 |
|---|---|
| 结论 | 微观与大局是否同向，用事实描述结构 |
| 微观结构 | 1m/2m/5m/10m/15m 的 EMA 5/25/55 排列、价格位置、RSI、最近交叉 |
| 大局观 | 周线/日线/2小时/1小时趋势与 RSI |
| 结构位 | 5m 摆动高低 + 日线关键位，标注距离 |
| 风险阶梯 | 紧/标准/宽三档止损对应的手数与有效杠杆 |
| 变化提示 | 与上一份相比变了什么 |

## 账户参数

`config.json` → `account`，风险阶梯按它计算：

```json
"account": { "equity": 1000, "riskPct": 1, "maxLeverage": 20, "contractOz": 100 }
```

- `equity` 账户净值（美元）
- `riskPct` 单笔最大风险占净值百分比（知识库铁律 ≤1%）
- `maxLeverage` 有效杠杆上限（知识库铁律 10-20x）
- `contractOz` 1 标准手对应盎司数（XAUUSD 通常 100）

> 杠杆 1000x 是**平台上限**，不是建议仓位。风险阶梯算的是"按 1% 风险、这笔止损该开多大"。

## 快速开始

```bash
node server.mjs
```

然后浏览器打开 **http://127.0.0.1:8848**

- 页面每 30 秒自动刷新
- 服务每 60 秒轮询一次告警（`config.json` 里可调）

只想在命令行看一眼：

```bash
node scripts/snapshot.mjs        # 打印完整快照
node scripts/alert-check.mjs     # 检查告警
```

## 配置 QQ 邮箱（必读）

QQ 邮箱**不能用登录密码发信**，必须用「授权码」。

1. 打开 QQ 邮箱 → 设置 → 账号
2. 找到「POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务」
3. 开启 **SMTP 服务**，按提示验证后会给你一串 **16 位授权码**（只显示一次）
4. 把 `config.json` 改成：

```json
"email": {
  "enabled": true,
  "smtpHost": "smtp.qq.com",
  "smtpPort": 465,
  "user": "你的QQ号@qq.com",
  "authCode": "刚才那16位授权码",
  "to": "收件邮箱@qq.com"
}
```

5. 验证通道：

```bash
node scripts/alert-check.mjs --test-mail
```

收到测试邮件就说明通了。

> 注意：`config.json` 里存着授权码，**不要提交到 GitHub**。仓库里应加 `.gitignore` 忽略它。

## 告警规则

| 规则 | 触发条件 | 默认阈值 |
|---|---|---|
| 创新低/新高 | 现价跌破年内最低 / 突破年内最高 | — |
| 异动 | 当日涨跌超过阈值 | 2% |
| 超买超卖 | 日线 RSI 低于 / 高于 | 25 / 75 |
| 临近关键位 | 距最近阻力或支撑小于 | 0.35% |
| 均线偏离 | 距 MA20 超过 | 6% |
| 多周期共振 | 四周期同向且共振值超过 | ±1.5 |

所有阈值都在 `config.json` 的 `alerts` 里改。

**冷却**：同一条告警 `cooldownHours`（默认 4 小时）内只发一次，避免邮箱被刷爆。

## 数据源

| 用途 | 来源 | 说明 |
|---|---|---|
| 现货价 | gold-api（XAU） | 与知识库同源 |
| 历史 K 线 | 东方财富 COMEX 黄金 `101.GC00Y` | 日/周/60 分钟，2 小时由 30 分钟合成 |
| 交叉校验 | 新浪（XAU / GC / 上海金） | 多源互检 |

> 早期曾用 Binance PAXG 做代理，实测其日内涨跌与现货背离（-0.11% vs -3.68%），已弃用。

## 目录

```
server.mjs              常驻服务（看板 + 告警轮询 + 邮件）
config.json             配置（邮箱、阈值）
lib/sources.mjs         行情抓取
lib/indicators.mjs      指标（MA/RSI/ATR/波动率）
lib/levels.mjs          关键位（枢轴/斐波/分型聚类/布林）
lib/desk.mjs            快照合成
lib/rules.mjs           告警规则
lib/notify.mjs          邮件内容
lib/mailer.mjs          零依赖 SMTP 客户端
public/index.html       看板界面
scripts/snapshot.mjs    单次快照
scripts/alert-check.mjs 单次告警检查 / 测试发信
黄金知识库/             你的方法论与历史数据
data/                   快照与告警状态（本地生成）
```

## 关于 GitHub

**不要把定时任务放到 GitHub Actions**：cron 最小 5 分钟且高峰会延迟 10-40 分钟，
对"第一时间"没有意义。GitHub 只用来存代码（建议私有仓库），调度交给本机服务。

需要开机自启，用 Windows 任务计划程序建一个"登录时运行"的任务，程序填：

```
node "C:\路径\DSH直播专用\server.mjs"
```

## 免责声明

本工具只做行情计算与条件提醒，**不构成投资建议**。杠杆交易可能损失全部本金，
所有决策与风险由使用者自行承担。
