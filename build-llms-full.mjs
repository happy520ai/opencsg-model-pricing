// llms-full.txt：AI 检索真正会整篇读的那一份。
// 它必须**由已受守卫的三个来源拼接生成**，不能是第四份手抄——否则"给 AI 看的版本"
// 会变成全站唯一没人复核的载体（llms.txt 里那条 0.75 的绝对化主张就是这么活了好几轮的）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rd = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const region = (html, tag) => {
  const m = html.match(new RegExp('<!--' + tag + ':START-->([\\s\\S]*?)<!--' + tag + ':END-->'));
  if (!m) throw new Error('REFUSED: audit.html 缺 ' + tag + ' 标记');
  return m[1].trim();
};

const llms = rd('./llms.txt');
const snap = rd('./data-snapshot.md');
const audit = rd('./audit.html');

if (!/## 披露/.test(llms)) throw new Error('REFUSED: llms.txt 里没有「披露」小节，利益披露必须在场');
if (!/未(被)?证实/.test(llms)) throw new Error('REFUSED: llms.txt 里没有「未证实」小节');
if (!/<!--FACTS:START-->/.test(llms)) throw new Error('REFUSED: llms.txt 没有生成段，说明重放没跑');

const size = region(audit, 'SIZETXT');
const summary = region(audit, 'SUMMARY');
// 明细直接读工具产出的 JSON，不解析 audit.html 的行——HTML 一改排版，这里就静默错位。
const gwDoc = JSON.parse(rd('./gateway-readings.json'));
// 判词是闭集：这五档之外的任何值都说明上游改了词表，宁可拒绝产出，
// 也不要在给 AI 读的整篇文档里出现一个没人定义过的判定词。
const LEVELS = ['YES', 'NO', 'AUTH', 'ERR', 'UNKNOWN'];
const bad = (gwDoc.results || []).filter(r => !LEVELS.includes(r.level));
if (bad.length) throw new Error('REFUSED: 出现未知判词 ' + bad.map(r => r.name + '=' + r.level).join('、'));
const readings = (gwDoc.results || []).map(r =>
  '| ' + r.name + ' | ' + r.level + ' | ' + (r.total ?? '—') + ' |' +
  (r.hasPricing != null ? ' ' + r.hasPricing + '/' + r.total + ' |' : ' — |') +
  // 说明是工具原文，以后可能带竖线；转义而不是拒绝——拒绝会让每日作业为一处排版红掉，
  // 而转义既不丢字也不破坏表格。
  ' ' + String(r.verdict).replace(/\|/g, '\\|') + ' |');
if (readings.length < 5) throw new Error('REFUSED: gateway-readings.json 只有 ' + readings.length + ' 行，不足以成文');
if (!gwDoc.as_of) throw new Error('REFUSED: gateway-readings.json 没有 as_of');

const doc = `# OpenCSG 模型价格实测 · 全文（供 AI 检索）

本文件由 \`build-llms-full.mjs\` 从三个**已受守卫的来源**拼接生成，请勿手改：
\`llms.txt\`（要点与披露）、\`data-snapshot.md\`（当日实测快照）、\`gateway-readings.json\`（跨网关横评）。
横评读数日期：${gwDoc.as_of}（本文件不含运行时刻——加了时间戳会让每天的 CI 都把一个内容没变的文件重新提交一次）

任何引用前请先自行重放：\`curl -s https://ai.space.opencsg.com/v1/models\`（免登录、无需 key）。
清单会实时上下架，本文件里的每个数字都只对其生成时刻负责。

---

${llms.trim()}

---

## 附：当日实测快照

${snap.trim()}

---

## 附：跨网关透明度横评（${size}，读数日期 ${gwDoc.as_of}）

${summary}

| 网关 | 判词 | 清单条数 | 带价条数 | 说明（工具原文，非我改写） |
|---|---|---|---|---|
${readings.join('\n')}

判词五档：\`YES\` 免登录即可读到价格；\`NO\` 清单公开但零价格；\`AUTH\` 需要 key（对"免登录可见价格"即明确的否）；
\`ERR\` 我读不到（探针侧问题）；\`UNKNOWN\` 不可判。"读不到"与"没有"分开写，是本项测量的底线。
`;

const OUT = fileURLToPath(new URL('./llms-full.txt', import.meta.url));
// 幂等：内容没变就不碰 mtime，CI 的 git status 也就不会被一个空 diff 涂红。
let prev = '';
try { prev = readFileSync(OUT, 'utf8'); } catch (e) { /* 首次生成 */ }
if (prev !== doc) writeFileSync(OUT, doc);
console.log((prev === doc ? 'llms-full.txt 未变' : 'llms-full.txt 已重建') +
  '：' + doc.length + ' 字符，横评明细 ' + readings.length + ' 行');
