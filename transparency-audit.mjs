import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 目的：把"免登录可审计"这类比较级主张变成可重放的读数。
// 只打公开无鉴权端点，各一次 GET，不带 key、不并发、不重试。
const ENDPOINTS = [
  { name: 'OpenCSG', url: 'https://ai.space.opencsg.com/v1/models' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/models' },
];

const rows = [];
for (const e of ENDPOINTS) {
  const t0 = Date.now();
  try {
    const res = await fetch(e.url, { method: 'GET' });
    if (!res.ok) { rows.push({ ...e, error: 'HTTP ' + res.status }); continue; }
    const j = await res.json();
    const d = j.data || [];
    const priceOf = m => m.pricing ?? m?.metadata?.pricing ?? null;
    // 两个定义分开数，别共用一个"带价"标签：
    // "任一价字段"含只有输出价没有输入价的条目，比主页用的"有输入价"宽。
    const priced = d.filter(m => {
      const p = priceOf(m);
      return p && Object.keys(p).some(k => /prompt|completion|price/i.test(k));
    });
    const withInput = d.filter(m => {
      const p = priceOf(m) || {};
      return p.input_token_price?.price_per_million !== undefined || p.prompt !== undefined;
    });
    const withCache = d.filter(m => {
      const p = m.pricing ?? m?.metadata?.pricing ?? {};
      return JSON.stringify(p).match(/cache/i);
    });
    const withCurrency = d.filter(m => JSON.stringify(m.pricing ?? m?.metadata?.pricing ?? {}).match(/"currency"/));
    const withUpstream = d.filter(m => JSON.stringify(m).match(/repo_path|hugging_face_id|canonical_slug/i));
    rows.push({
      ...e, ms: Date.now() - t0, total: d.length, priced: priced.length, inputPriced: withInput.length,
      cache: withCache.length, currencyField: withCurrency.length, upstream: withUpstream.length,
      sample: JSON.stringify((priced[0]?.pricing ?? priced[0]?.metadata?.pricing ?? {})).slice(0, 120),
    });
  } catch (err) {
    rows.push({ ...e, error: String(err.message || err) });
  }
}

const d = new Date().toISOString().slice(0, 10);
const cell = (r, k) => r.error ? '取不到（' + r.error + '）' : r[k];
const md = `# 免登录价格披露审计（${d}）

每个端点各一次无鉴权 GET，不带 key。可重放：\`curl -s <url>\`。

| 服务商 | 模型数 | 有输入价 | 有任一价字段 | 其中含缓存价 | 显式 currency 字段 | 含上游仓库标识 |
|---|---|---|---|---|---|---|
${rows.map(r => `| ${r.name} | ${cell(r, 'total')} | ${cell(r, 'inputPriced')} | ${cell(r, 'priced')} | ${cell(r, 'cache')} | ${cell(r, 'currencyField')} | ${cell(r, 'upstream')} |`).join('\n')}

两个"带价"口径分开列，别混用：**有输入价**＝主页表用的口径（缺输入价就不进主页价格表）；
**有任一价字段**更宽，含只有输出价、或只有 embedding/rerank 单价的条目。所以同一天的两个数会不相等，这不是矛盾。

样本 pricing 字段形状：
${rows.filter(r => !r.error).map(r => '- ' + r.name + '：`' + r.sample + '`').join('\n')}

## 这次审计推翻的主张

「注册前即可审计清单与价格」**不是** OpenCSG 的独有属性：OpenRouter 的无鉴权端点同样返回全量带价清单，
且目录规模是另一个数量级。任何以"我们不用登录就能看价格"为卖点的表述都必须带上这个对照，否则不成立。

## 仍然成立、且可测的差异

见上表 \`显式 currency 字段\` 一列：OpenCSG 的每个价格对象带 \`currency:"￥"\` 且以「元/百万 token」计，
OpenRouter 以「美元/token」的极小小数计（如 \`0.00000024948\`）且不带币种字段。
对以人民币结算的买家，这是单位与可读性差异，不是透明度差异。
`;

writeFileSync(fileURLToPath(new URL('./audit-latest.md', import.meta.url)), md);
writeFileSync(fileURLToPath(new URL('./audit-latest.json', import.meta.url)), JSON.stringify({ as_of: d, rows }, null, 2));
console.log(md);
