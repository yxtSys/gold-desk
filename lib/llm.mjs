// llm.mjs —— DeepSeek 客户端（私有密钥从 secrets.json 读取，永不打印）
import { readFile } from 'node:fs/promises';

let cache = null;

export async function loadLLM() {
  if (cache) return cache;
  // 优先环境变量（GitHub Actions Secrets），本地回退到 secrets.json
  if (process.env.DEEPSEEK_API_KEY) {
    cache = {
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    };
    return cache;
  }
  const s = JSON.parse(await readFile('secrets.json', 'utf8')).deepseek;
  if (!s?.apiKey) throw new Error('缺少 API Key：环境变量 DEEPSEEK_API_KEY 或 secrets.json');
  cache = s;
  return s;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function chat({ messages, json = false, temperature = 0.3, maxTokens = 900, retries = 3 }) {
  const s = await loadLLM();
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(s.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.apiKey },
        body: JSON.stringify({
          model: s.model,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (!j.choices?.[0]) throw new Error('返回异常: ' + JSON.stringify(j).slice(0, 160));
      return { content: j.choices[0].message.content, usage: j.usage, model: j.model };
    } catch (e) {
      lastErr = e;
      await sleep(1200 * (i + 1));
    }
  }
  throw lastErr;
}

export async function chatJSON(opts) {
  const r = await chat({ ...opts, json: true });
  try {
    return { ...JSON.parse(r.content), _usage: r.usage, _model: r.model };
  } catch {
    throw new Error('模型返回的不是合法 JSON');
  }
}
