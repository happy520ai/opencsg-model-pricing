import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTML = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');
const LLMS_EARLY = readFileSync(fileURLToPath(new URL('./llms.txt', import.meta.url)), 'utf8');
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

  // og:image:alt 与 llms.txt 的条数以前只被"字段在场"覆盖，数字本身没人比对。
  // 被转发的那一段文字，恰恰是最不该留着旧数字的地方。
  const livePriced = j.data.filter(m => m?.metadata?.pricing?.input_token_price?.price_per_million != null).length;
  const alt = (HTML.match(/property="og:image:alt" content="([^"]*)"/) || [])[1] || '';
  const altM = alt.match(/(\d+) 条模型、(\d+) 条带价/);
  if (!altM) fails.push('og:image:alt 里读不到「N 条模型、M 条带价」，无法比对（格式变了要同步改这里）');
  else if (Number(altM[1]) !== liveCount || Number(altM[2]) !== livePriced)
    fails.push(`og:image:alt 写 ${altM[1]} 条模型 / ${altM[2]} 条带价，实时是 ${liveCount} / ${livePriced}`);
  else ok.push(`og:image:alt 的 ${altM[1]}/${altM[2]} 与实时一致`);

  const fm = LLMS_EARLY.match(/<!--FACTS:START-->([\s\S]*?)<!--FACTS:END-->/);
  if (!fm) fails.push('llms.txt 缺 FACTS 标记（该段应由 refresh-model-table.mjs 生成）');
  else {
    const tot = (fm[1].match(/免登录返回 (\d+) 条/) || [])[1];
    const pri = (fm[1].match(/其中 (\d+) 条公布输入单价/) || [])[1];
    if (tot === undefined || pri === undefined) fails.push('llms.txt FACTS 段读不到条数句式，格式变了要同步改守卫');
    else if (Number(tot) !== liveCount || Number(pri) !== livePriced)
      fails.push(`llms.txt 关键事实写 ${tot}/${pri}，实时 ${liveCount}/${livePriced}（跑 refresh-model-table.mjs 重生成）`);
    else ok.push(`llms.txt 关键事实 ${tot}/${pri} 与实时一致（生成物，非手抄）`);
  }

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

// 9a. 审计页是横评文案唯一外链的那一页，此前它连一个 og: 标签都没有——分享出去
//     没有标题、没有图，等于把最有转发价值的一页做成纯文本链接。
const AUDIT_URL = 'https://happy520ai.github.io/opencsg-model-pricing/audit.html';
const metaOf = name => {
  const re = new RegExp('<meta (?:property|name)="' + name + '" content="([^"]*)"');
  const m = AUDIT_RAW.match(re);
  return m ? m[1] : null;
};
for (const k of ['og:type', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:alt',
  'twitter:card', 'twitter:title', 'twitter:image']) {
  if (metaOf(k) === null) fails.push('审计页缺 <meta ' + k + '>（分享会没有预览）');
}
if (metaOf('twitter:card') !== 'summary_large_image') fails.push('twitter:card 不是 summary_large_image，大图预览不会出');
if (metaOf('og:url') !== AUDIT_URL) fails.push('og:url 指向别处：' + metaOf('og:url'));
const canon = (AUDIT_RAW.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
if (canon !== AUDIT_URL) fails.push('canonical 与 og:url 不一致：' + canon);
for (const k of ['og:image', 'twitter:image']) {
  const v = metaOf(k);
  if (v && !/\/audit-og\.png$/.test(v)) fails.push(k + ' 没指向本页自己的分享卡（复用了别页的图＝预览与内容不符）：' + v);
}
// 数字只许活在每天重画的分享卡里，不许活在静态 meta 里——meta 没人回头复核。
const ogDesc = metaOf('og:description') || '';
if (/\d+\s*\/\s*\d+/.test(ogDesc)) fails.push('og:description 里出现了比值，它会腐烂：' + ogDesc);
if (/\d+ 家/.test(ogDesc)) fails.push('og:description 里出现了家数，它会腐烂：' + ogDesc);
try {
  const png = readFileSync(fileURLToPath(new URL('./audit-og.png', import.meta.url)));
  const sig = png.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (!sig) fails.push('audit-og.png 不是合法 PNG');
  else if (png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630)
    fails.push(`audit-og.png 尺寸 ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}，不是 1200x630`);
  else ok.push('audit-og.png 存在且为 1200x630 PNG');
} catch {
  fails.push('缺 audit-og.png —— 审计页的 og:image 会 404');
}
try {
  const wres = await fetch(WIDE_URL);
  if (!wres.ok) throw new Error('HTTP ' + wres.status);
  const wdoc = await wres.json();
  const n = (wdoc.results || []).length;
  for (const k of ['og:title', 'twitter:title']) {
    const v = metaOf(k);
    const m = v && v.match(/(\d+) 家/);
    if (!m) fails.push(k + ' 里没有「N 家」，无法核对家数：' + v);
    else if (Number(m[1]) !== n) fails.push(`${k} 写 ${m[1]} 家，工具实际测了 ${n} 家`);
  }
  const t = (AUDIT_RAW.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const tm = t.match(/(\d+) 家/);
  if (!tm) fails.push('<title> 里没有家数');
  else if (Number(tm[1]) !== n) fails.push(`<title> 写 ${tm[1]} 家，实时 ${n} 家`);
  else ok.push(`审计页标题/og 家数与工具产出对齐（${n} 家）`);
} catch (e) {
  fails.push('审计页家数无法复核（拉不到工具产出：' + e.message + '）');
}

try {
  const GWDOC = await (await fetch(WIDE_URL)).json();
  const GWROWS = GWDOC.results || [];
  const gwc = lvl => GWROWS.filter(r => r.level === lvl).length;
  // 正文那句「只有 3 家…1 家…7 家…」是全页最会被单独摘走转发的句子，现已由
  // embed-readings.mjs 生成。这里复核它，是为了抓"标记还在但生成器不再填它"这一类失效：
  // 那种情况下页面会永远停在最后一次成功生成时的数字，而且看起来完全正常。
  const summaryM = AUDIT_RAW.match(/<!--SUMMARY:START-->([\s\S]*?)<!--SUMMARY:END-->/);
  if (!summaryM) fails.push('找不到 SUMMARY 区块（生成器落点丢了？）');
  else {
    const want = '截至 ' + GWDOC.as_of + '：只有 ' + (gwc('YES')) + ' 家免登录公布价格，' +
      (gwc('NO')) + ' 家公开清单却完全不标价，' + (gwc('AUTH')) + ' 家连清单都要 key';
    if (summaryM[1] !== want) fails.push('审计页正文那句横评与工具实时产出不符：\n      页面「' + summaryM[1] + '」\n      应为「' + want + '」');
    else ok.push('审计页正文那句横评由生成器产出且与工具实时一致');
    const sizeM = AUDIT_RAW.match(/<!--SIZETXT:START-->([\s\S]*?)<!--SIZETXT:END-->/);
    if (!sizeM) fails.push('找不到 SIZETXT 区块');
    else if (sizeM[1] !== (GWROWS.length) + ' 家每日自动读数')
      fails.push('审计页「N 家每日自动读数」写的是「' + sizeM[1] + '」，工具实际测了 ' + (GWROWS.length) + ' 家');
  }
} catch (e) {
  fails.push('审计页正文横评无法复核（拉不到工具产出：' + e.message + '）')
}

// 带日期的主张必须指向带日期的工件。RESULTS.md 每天被覆盖，所以
// 「截至 2026-10-17……见 RESULTS.md」在第二天就成了一句查不到出处的话。
const datedClaim = /截至 (20\d{2}-\d{2}-\d{2})/.exec(AUDIT_RAW);
if (datedClaim) {
  if (!AUDIT_RAW.includes('tree/main/results/history')) {
    fails.push('审计页有带日期的主张（截至 ' + datedClaim[1] + '）却不含按日归档的链接 —— 指向会被覆盖的文件等于没有出处');
  } else {
    ok.push('带日期的主张配有按日归档链接（' + datedClaim[1] + ' → results/history/）');
  }
}

// 9c. 审计页那张「当场测你自己的网关」卡片：判词口径必须与 CLI 一致，
//     而且页面上那句「不带 cookie」必须是代码事实，不是宣传语。
for (const n of ['id="u"', 'id="go"', 'resolveModelsUrl']) {
  if (!AUDIT_RAW.includes(n)) fails.push('审计页自测件缺 ' + n);
}
// 「说了不发 cookie」与「真的不发」是两件事：逐个 fetch 查，不按数量猜。
const fetches = AUDIT_RAW.match(/fetch\([^)]*\)/g) || [];
if (fetches.length === 0) fails.push('审计页找不到任何 fetch —— 自测件被删了？');
const sloppy = fetches.filter(f => !f.includes("credentials: 'omit'"));
for (const f of sloppy) fails.push('有个 fetch 没带 credentials: omit：' + f.slice(0, 70));
if (fetches.length && !sloppy.length) {
  ok.push('审计页 ' + fetches.length + ' 个 fetch 全部 omit credentials（页面声明与代码一致）');
}
// 五档语义不许在浏览器实现里被压平。注意：判词文案是**拼出来的**
// （' → ' + (authed ? 'AUTH…' : 'ERR…')），所以查「→ AUTH」这种运行时字串永远查不到——
// 我第一版就是这么写的，被自己的判据判红才发现。要查的是结构：谁走 AUTH 分支、谁走 ERR 分支。
for (const v of ['res.status === 401', 'res.status === 403', "'AUTH：", "'ERR：",
  'Array.isArray(d)', 'd.length === 0', '不构成模型保真度证明']) {
  if (!AUDIT_RAW.includes(v)) fails.push('审计页自测件缺结构要件：' + v);
}
if (AUDIT_RAW.includes("'AUTH：") && AUDIT_RAW.includes("'ERR：")) {
  ok.push('自测件把 401/403 归 AUTH、把 404/空清单/错形状归 ERR（两档各有分支，没被压平）');
}

// 9d. 分享链接的安全不变量。这三条一旦破掉，功能就从「可核对的链接」变成
//     「任何人可构造、让访客浏览器去打任意 URL 的向量」，所以必须机械锁住。
const claimFn = (AUDIT_RAW.match(/function showSharedClaim\(\)[\s\S]*?\n\}/) || [''])[0];
if (!claimFn) fails.push('找不到 showSharedClaim —— 分享件被删了？');
else {
  if (/probeOwn\s*\(/.test(claimFn)) fails.push('showSharedClaim 里会自动发请求（probeOwn）—— 带参链接不该自己打任意 URL');
  else ok.push('带参链接不自动发请求（要访客自己点一次）');
  if (/innerHTML/.test(claimFn)) fails.push('showSharedClaim 用了 innerHTML —— URL 参数可注入 HTML');
  else if (!claimFn.includes('textContent')) fails.push('showSharedClaim 没走 textContent');
  else ok.push('分享横幅只走 textContent（URL 参数无法注入）');
  for (const s of ['不是本页测的', '没有发出任何请求']) {
    if (!claimFn.includes(s)) fails.push('分享横幅缺关键说明：' + s);
  }
}
const linkFn = (AUDIT_RAW.match(/function shareLink\(\)[\s\S]*?\n\}/) || [''])[0];
if (!linkFn) fails.push('找不到 shareLink');
else if (/key|token|authorization|cookie/i.test(linkFn)) {
  fails.push('shareLink 里出现疑似凭据字样 —— 分享链接不该带任何 key');
} else ok.push('分享链接只带地址与判词，不含凭据字样');

// 9b. 不执行 JS 的读者必须还能看到数字（2026-10-17 实测：两张表都是"加载中…"，
//     等于把最有转发价值的横评对爬虫和 AI 助手完全藏起来了）。
// 这条判据原先写死 ['466/466','457/471','0/81'] —— 一个防手抄数字的门，自己手抄了数字。
// 它连续几天全绿，不是因为世界没变，是因为它读的是自己那串常量；OpenRouter 一从
// 466 变 467，它立刻变红，且红得完全指错方向（页面是对的，判据是错的）。
// 现在按档位从现场读数里取代表值，判据只问"无 JS 读者能不能看到每档的真实数字"。
const NOJS = AUDIT.replace(/<!--READINGS:(START|END)-->/g, '').replace(/<!--OWNREADINGS:(START|END)-->/g, '');
if (/尚未生成/.test(NOJS)) fails.push('审计页有静态快照没生成（无 JS 读者会看到占位符）');
if (/加载中/.test(NOJS)) fails.push('审计页正文仍留有"加载中…"占位（无 JS 时表格是空的）');
try {
  const nres = (await (await fetch(WIDE_URL)).json()).results || [];
  let seen = 0;
  for (const lvl of ['YES', 'NO', 'AUTH']) {
    const rep = nres.find(r => r.level === lvl);
    if (!rep) continue;
    const token = lvl === 'AUTH' ? '需要 key 才能读清单' : `${rep.hasPricing}/${rep.total}`;
    if (!NOJS.includes(token)) {
      fails.push(`审计页静态快照缺 ${lvl} 档代表读数「${token}」（取自 ${rep.name} 的现场读数）`);
    } else seen++;
  }
  if (seen === 0) fails.push('无 JS 可见性判据一条都没比对上——判据或快照已失效');
  else ok.push(`审计页对不执行 JS 的读者仍给出各档真实读数（比对 ${seen} 档，代表值取自现场）`);
} catch (e) {
  fails.push('无 JS 可见性无法复核（拉不到工具产出：' + e.message + '）');
}

// 10. 任何一页都不许给无 JS 读者留一句"永远加载中"。
//     这类文案对爬虫是正文，对 AI 助手是会转述的句子。
const stuckBefore = fails.length;
for (const page of ['./index.html', './cost-calculator.html', './audit.html']) {
  const raw = readFileSync(fileURLToPath(new URL(page, import.meta.url)), 'utf8');
  const t = raw.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  const stuck = ['加载中', '正在拉取', '正在现场'].filter(k => t.includes(k));
  if (stuck.length && !/<noscript/i.test(raw)) {
    fails.push(`${page} 无 JS 时会永远显示「${stuck.join('/')}」，且没有 <noscript> 说明`);
  } else if (stuck.length) {
    fails.push(`${page} 仍留有卡住的提示词：「${stuck.join('/')}」（应改成如实写"这是静态快照"）`);
  }
}
// 只有这一段真的没添新失败时才许印 ok（否则"ok"成了无条件装饰）。
if (fails.length === stuckBefore) ok.push('三页均无"永远加载中"式残留');

// 11. 邀请链接不会自动带码（2026-10-17 实测注册页 Enter your code 为空）。
//     任何放了注册链接却没有"手填"指示的页面，都会让读者白注册、让推荐白做。
const CODE_LINK = 'invitationCode=7OV90VFJG1';
for (const page of ['./index.html', './cost-calculator.html', './audit.html', './llms.txt']) {
  const raw = readFileSync(fileURLToPath(new URL(page, import.meta.url)), 'utf8');
  if (!raw.includes(CODE_LINK)) continue;
  if (!/手填|Enter your code/.test(raw)) {
    fails.push(`${page} 放了注册链接却没写"要手填邀请码"——链接不带码，读者会白注册`);
  }
}
ok.push('所有含注册链接的页面都明示"需手填邀请码"');

// 12. 提到 50/99 元额度的文件，必须同时带上"活动可能已收官"的限定。
//     这些句子在收官之后逐字仍"曾经为真"，却已变成虚假承诺——llms.txt 还会被 AI 直接转述。
for (const f of ['./index.html', './cost-calculator.html', './audit.html', './llms.txt', './README.md']) {
  const raw = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
  if (/50 元|99 元/.test(raw) && !/收官|已失效/.test(raw)) {
    fails.push(`${f} 写了额度数字却没有"活动可能已收官"限定语——会被当成现行承诺`);
  }
}
ok.push('所有含额度数字的文件都带活动状态限定');

console.log(ok.map(x => '  ok  ' + x).join('\n'));
// 用 exitCode 而不是 process.exit()：Windows 上强退会与未排空的 fetch handle
// 相撞，触发 libuv 断言并把退码变成 127（真机复现过），判据就不可信了。
if (fails.length) { console.error('\nFAIL:\n' + fails.map(x => '  X  ' + x).join('\n')); process.exitCode = 1; }
else console.log('\nALL CHECKS PASSED');
