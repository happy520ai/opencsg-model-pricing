import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const URL_MODELS = 'https://ai.space.opencsg.com/v1/models';
const OUT = fileURLToPath(new URL('./data-snapshot.md', import.meta.url));

const res = await fetch(URL_MODELS);
if (!res.ok) {
  console.error('FAIL 接口不可达 HTTP ' + res.status + '，本次不产出表格（宁可不发，不发旧数）');
  process.exit(1);
}
const json = await res.json();
const rows = json.data ?? [];
if (!Array.isArray(rows) || rows.length === 0) {
  console.error('FAIL 返回 0 条，探针读数不可信，不产出');
  process.exit(1);
}

const price = m => m?.metadata?.pricing?.input_token_price?.price_per_million ?? null;
const out = m => m?.metadata?.pricing?.output_token_price?.price_per_million ?? null;

const priced = rows.filter(m => price(m) !== null);
const known6 = ['deepseek-v4.1-flash', 'deepseek-v4-pro', 'glm-5.3-flash',
  'qwen3.8-flash', 'qwen3.8-max', 'kimi-k3'];
const hit = new Set(rows.map(m => m.id.toLowerCase()));
const missing = known6.filter(id => !hit.has(id.toLowerCase()));

priced.sort((a, b) => price(a) - price(b));
const d = new Date().toISOString().slice(0, 10);

const missingLine = missing.length === 0
  ? '全部命中。'
  : '未命中（不得写进物料）：' + missing.map(x => '`' + x + '`').join('、');

const md = `# OpenCSG 可调模型与价格（实测快照）

核查日期：${d}　来源：\`${URL_MODELS}\`（免登录 GET）
重放方式：\`curl -s ${URL_MODELS}\`　本次返回 **${rows.length}** 条，其中 **${priced.length}** 条带输入价。

| 模型 id | 输入 元/百万 token | 输出 元/百万 token | 上游仓库 |
|---|---|---|---|
${priced.map(m => `| ${m.id} | ${price(m)} | ${out(m) ?? '-'} | ${m?.metadata?.repo_path ?? '-'} |`).join('\n')}

## 主文案六个具名模型的核对结果

${missingLine}
`;

writeFileSync(OUT, md);
console.log(md);
console.log('已写入 ' + OUT);
