import { writeFileSync, readFileSync } from 'node:fs';
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

// llms.txt 是给 AI 检索直接转述的那一份。它的"关键事实"以前是手抄的，
// 手抄的当前态数字没人复核就会腐烂——所以这一段改由本次实时读数生成，标记缺失即拒绝产出。
const RE = /<!--FACTS:START-->[\s\S]*?<!--FACTS:END-->/;
const pricedSorted = priced; // 上面已就地按输入价升序排过
const minM = pricedSorted[0], maxM = pricedSorted[pricedSorted.length - 1];
const tg = pricedSorted.filter(m => (m.metadata?.tasks ?? []).includes('text-generation'));
const tgMin = tg.length ? price(tg[0]) : null;
const tie = tgMin === null ? [] : tg.filter(m => price(m) === tgMin).map(m => '`' + m.id + '`');
const facts = [
  '以下三行由 `refresh-model-table.mjs` 对着实时接口重放后生成，不是手抄：',
  `- 模型清单：免登录返回 ${rows.length} 条，其中 ${priced.length} 条公布输入单价`,
  `- 输入价区间：${price(minM)} – ${price(maxM)} 元/百万 token（最低 \`${minM.id}\`，最高 \`${maxM.id}\`）`,
  tgMin === null
    ? '- （本轮无模型带 `tasks: ["text-generation"]`，该条不产出——空档也是读数）'
    : `- 接口 \`tasks\` 标了 \`text-generation\` 的 ${tg.length} 条中，最低输入价 ${tgMin} 元/百万 token（${tie.join('、')} 并列）`,
].join('\n');
const block = '<!--FACTS:START-->\n' + facts + '\n<!--FACTS:END-->';
const LLMS = fileURLToPath(new URL('./llms.txt', import.meta.url));
const llms = readFileSync(LLMS, 'utf8');
if (!RE.test(llms)) {
  console.error('FAIL llms.txt 里没有 FACTS 标记，拒绝产出（不静默留下旧数字）');
  process.exit(1);
}
const hitCount = (llms.match(RE) || []).length;
if (hitCount !== 1) {
  console.error(`FAIL llms.txt 有 ${hitCount} 处 FACTS 标记，期望 1 处`);
  process.exit(1);
}
writeFileSync(LLMS, llms.replace(RE, () => block));
console.log(llms.match(RE)[0] === block ? 'llms.txt 关键事实未变' : 'llms.txt 关键事实已刷新为实时读数');
