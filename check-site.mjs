import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTML = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');
const fails = [];
const ok = [];

// 1. JSON-LD 必须是合法 JSON
const ld = HTML.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!ld) fails.push('缺 JSON-LD');
else { try { JSON.parse(ld[1]); ok.push('JSON-LD 合法'); } catch (e) { fails.push('JSON-LD 解析失败: ' + e.message); } }

// 2. 表格价格必须与实时接口一致（当场重放，不信快照文件）
const res = await fetch('https://ai.space.opencsg.com/v1/models');
if (!res.ok) fails.push('接口不可达 HTTP ' + res.status);
else {
  const j = await res.json();
  const byId = new Map(j.data.map(m => [m.id.toLowerCase(), m]));
  const strip = s => s.replace(/<[^>]+>/g, '').trim();
  // 逐行覆盖整张表，不只抽查高亮行：被下架的模型若还留在表里，
  // 抽查三行是看不见的（2026-10-17 真机暴露了这个缺口）。
  const tbody = (HTML.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
  const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(m => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => strip(c[1])));
  let checked = 0;
  for (const cells of rows) {
    const [id, inp, outp] = cells;
    if (!id) continue;
    const m = byId.get(id.toLowerCase());
    if (!m) { fails.push('表内模型 ' + id + ' 已不在实时接口（该下架这一行）'); continue; }
    const ai = m?.metadata?.pricing?.input_token_price?.price_per_million ?? null;
    const ao = m?.metadata?.pricing?.output_token_price?.price_per_million ?? null;
    const near = (a, b) => Math.abs(a - b) <= Math.max(0.005, Math.abs(b) * 0.005);
    if (ai === null) { fails.push(id + ' 实时已无输入价，表内仍写 ' + inp); continue; }
    if (!near(Number(inp), ai)) fails.push(id + ' 输入价不符：表 ' + inp + ' vs 实时 ' + ai);
    if (outp === '-' || outp === '') {
      if (ao !== null) fails.push(id + ' 表内写「-」但实时已有输出价 ' + ao);
    } else if (ao === null) {
      fails.push(id + ' 表内写输出价 ' + outp + ' 但实时未公布');
    } else if (!near(Number(outp), ao)) {
      fails.push(id + ' 输出价不符：表 ' + outp + ' vs 实时 ' + ao);
    }
    checked++;
  }
  if (checked < 10) fails.push('整表只比对到 ' + checked + ' 行，覆盖不足');
  else ok.push('整表 ' + checked + ' 行已与实时接口逐字段比对（不再只抽查高亮行）');

  const liveCount = j.data.length;
  const snapMatch = HTML.match(/const SNAP = (\d+)/);
  if (!snapMatch) fails.push('找不到 SNAP 常量');
  else if (Number(snapMatch[1]) !== liveCount)
    fails.push('页面快照数写的是 ' + snapMatch[1] + '，实时已是 ' + liveCount + '（清单会漂移，必须重生成）');
  else ok.push('快照条数 ' + liveCount + ' 与实时一致');

  const kimi = j.data.filter(m => /kimi|moonshot/i.test(m.id + (m.metadata?.repo_path ?? '')));
  if (kimi.length > 0) ok.push('注意：接口本次出现 Kimi 系 ' + kimi.length + ' 条，禁用条款可解除');
}

// 3. 禁用表述不许出现在正文
const banned = ['立即领取99元', '白送99', '注册送99', '无限量免费', '所有国产模型', '国内第一', '最便宜'];
for (const b of banned) if (HTML.includes(b)) fails.push('出现禁用表述：' + b);
ok.push('禁用表述扫描完成（' + banned.length + ' 条）');

// 4. 必须存在的诚实要素
const needed = ['利益披露', 'rel="nofollow sponsored"', '我本人没有实测对话', '命中 <strong>0</strong>'];
for (const n of needed) if (!HTML.includes(n)) fails.push('缺少必备诚实要素：' + n);

// 5. 标签粗平衡
for (const t of ['div', 'table', 'main', 'script', 'pre']) {
  const o = (HTML.match(new RegExp('<' + t + '[ >]', 'g')) ?? []).length;
  const c = (HTML.match(new RegExp('</' + t + '>', 'g')) ?? []).length;
  if (o !== c) fails.push('<' + t + '> 开闭不平衡：' + o + ' vs ' + c);
  else ok.push('<' + t + '> 平衡 ' + o);
}

// 6. 计算器：它必须"无静态数字"，否则就是一张会过期的假表
const CALC_RAW = readFileSync(fileURLToPath(new URL('./cost-calculator.html', import.meta.url)), 'utf8');
const CALC = CALC_RAW.replace(/<script[\s\S]*?<\/script>/g, '');
for (const n of ['利益披露', '模型保真度我未验证', '不参与排名', 'ai.space.opencsg.com/v1/models']) {
  if (!CALC.includes(n)) fails.push('计算器缺少：' + n);
}
if (/<td/i.test(CALC)) fails.push('计算器正文出现静态 <td>：价格表必须由 JS 从实时接口生成，写死就会过期');
if (/¥\s?\d/.test(CALC)) fails.push('计算器正文出现写死的 ¥ 金额：同上');
if (!HTML.includes('cost-calculator.html')) fails.push('主页未链到计算器（少一个内链，也少一处会过期的入口）');

// 7b. 审计页：结论必须带着那个反例，且不许写死计数
const AUDIT_RAW = readFileSync(fileURLToPath(new URL('./audit.html', import.meta.url)), 'utf8');
const AUDIT = AUDIT_RAW.replace(/<script[\s\S]*?<\/script>/g, '');
for (const n of ['利益披露', 'OpenRouter', '不是透明度差异', 'ai.space.opencsg.com/v1/models',
  '11 家全景', '才是', '只有一台仪器']) {
  if (!AUDIT.includes(n)) fails.push('审计页缺少：' + n);
}
// 跨仓库拉取地址在 <script> 里（AUDIT 已剥掉脚本），所以要拿原文测。
// 第一版把它放进上面的正文断言里，永远不可能通过——判据指错了区域。
if (!AUDIT_RAW.includes('raw.githubusercontent.com/happy520ai/gateway-price-check')) {
  fails.push('审计页不再从 gateway-price-check 仓库现拉读数（跨仓库链路断了）');
}
// 静态数字只允许出现在生成区块里。区块之外写死一个数，才是真的会过期。
// （第一版这条判据写成"正文里不许有任何 <td>数字"，与"无 JS 读者要能看到读数"
//   直接冲突——两条都测过一次才发现问题在我自己的判据，不在页面。）
const GENERATED = /<!--(?:READINGS|OWNREADINGS):START-->[\s\S]*?<!--(?:READINGS|OWNREADINGS):END-->/g;
const OUTSIDE = AUDIT.replace(GENERATED, '');
if (/<td[^>]*>\d/.test(OUTSIDE)) fails.push('审计页在生成区块之外写死了数字（那部分没人复核，会过期）');

// 8. llms.txt 必须与两页同源披露
const LLMS = readFileSync(fileURLToPath(new URL('./llms.txt', import.meta.url)), 'utf8');
// 判"有没有声明未证实"要按性质匹配，别钉死某一种措辞（首版钉「未证实」，
// 而 llms.txt 写的是「未被证实」，守卫红的是我自己写的字，不是文档缺了什么）
if (!/未(被)?证实/.test(LLMS)) fails.push('llms.txt 缺少未证实声明');
for (const n of ['邀请码', 'cost-calculator.html', '保真度未验证']) {
  if (!LLMS.includes(n)) fails.push('llms.txt 缺少：' + n);
}
for (const b of ['立即领取99元', '注册送99', '所有国产模型都有']) {
  for (const [name, doc] of [['index.html', HTML], ['cost-calculator.html', CALC], ['llms.txt', LLMS]]) {
    if (doc.includes(b)) fails.push(name + ' 出现禁用表述：' + b);
  }
}

// 8b. sitemap 与 IndexNow 清单必须同源，否则新增页面会静默漏交
const SITEMAP = readFileSync(fileURLToPath(new URL('./sitemap.xml', import.meta.url)), 'utf8');
const WF = readFileSync(fileURLToPath(new URL('./.github/workflows/refresh.yml', import.meta.url)), 'utf8');
const locs = [...SITEMAP.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)].map(m => m[1]);
if (locs.length === 0) fails.push('sitemap 里没有 <loc>，比对失去意义');
for (const u of locs) {
  if (!WF.includes(u)) fails.push('页面在 sitemap 里但没进 IndexNow 提交清单：' + u);
}
if (locs.length) ok.push('sitemap ' + locs.length + ' 条 URL 均已纳入 IndexNow 清单');

// 9. 首页那句"11 家横评"是手抄的，必须对着工具每日产出的 JSON 复核，
//    否则它会变成我一路在防的那种东西：一个没人再验证过的数字。
const WIDE_URL = 'https://raw.githubusercontent.com/happy520ai/gateway-price-check/main/results/latest.json';
try {
  const wres = await fetch(WIDE_URL);
  if (!wres.ok) throw new Error('HTTP ' + wres.status);
  const wdoc = await wres.json();
  const by = (wdoc.results || []).reduce((a, r) => (a[r.level] = (a[r.level] || 0) + 1, a), {});
  const claims = [
    ['YES', by.YES ?? 0, /<span class="badge live">(\d+) 家<\/span> 免登录就公布价格/],
    ['NO', by.NO ?? 0, /<span class="badge snap">(\d+) 家<\/span> 公开清单却一个价都不标/],
    ['AUTH', by.AUTH ?? 0, /<span class="badge">(\d+) 家<\/span> 不注册连清单都看不到/],
  ];
  for (const [lvl, expect, re] of claims) {
    const m = HTML.match(re);
    if (!m) { fails.push(`首页找不到 ${lvl} 那半句横评（被改写了？`); continue; }
    if (Number(m[1]) !== expect) fails.push(`首页横评 ${lvl} 写的是 ${m[1]} 家，工具实时产出是 ${expect} 家`);
  }
  const totalClaim = HTML.match(/把 (\d+) 家网关横评/);
  if (!totalClaim) fails.push('首页横评总数那句找不到');
  else if (Number(totalClaim[1]) !== (wdoc.results || []).length)
    fails.push(`首页写 ${totalClaim[1]} 家，工具实际测了 ${(wdoc.results || []).length} 家`);
  else ok.push(`首页横评 3 项计数 + 总数已与工具产出对齐（${totalClaim[1]} 家）`);
} catch (e) {
  fails.push('首页横评无法复核（拉不到工具产出：' + e.message + '）——宁可判红，别放过期数字');
}

// 9b. 不执行 JS 的读者必须还能看到数字（2026-10-17 实测：两张表都是"加载中…"，
//     等于把最有转发价值的横评对爬虫和 AI 助手完全藏起来了）。
const NOJS = AUDIT.replace(/<!--READINGS:(START|END)-->/g, '').replace(/<!--OWNREADINGS:(START|END)-->/g, '');
if (/尚未生成/.test(NOJS)) fails.push('审计页有静态快照没生成（无 JS 读者会看到占位符）');
if (/加载中/.test(NOJS)) fails.push('审计页正文仍留有"加载中…"占位（无 JS 时表格是空的）');
for (const token of ['466/466', '457/471', '0/81', '需要 key 才能读清单']) {
  if (!NOJS.includes(token)) fails.push('审计页静态快照缺少实时可见性关键的读数：' + token);
}
ok.push('审计页对不执行 JS 的读者仍给出完整 11 行读数');

console.log(ok.map(x => '  ok  ' + x).join('\n'));
// 用 exitCode 而不是 process.exit()：Windows 上强退会与未排空的 fetch handle
// 相撞，触发 libuv 断言并把退码变成 127（真机复现过），判据就不可信了。
if (fails.length) { console.error('\nFAIL:\n' + fails.map(x => '  X  ' + x).join('\n')); process.exitCode = 1; }
else console.log('\nALL CHECKS PASSED');
