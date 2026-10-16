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
  const rows = [...HTML.matchAll(/<tr class="hi"><td><strong>([\w.\-]+)<\/strong><\/td><td class="n"><strong>([\d.]+)<\/strong><\/td><td class="n"><strong>([\d.]+)<\/strong><\/td>/g)];
  for (const [, id, inp, outp] of rows) {
    const m = byId.get(id.toLowerCase());
    if (!m) { fails.push('HTML 里的模型 ' + id + ' 在实时接口中不存在'); continue; }
    const ai = m?.metadata?.pricing?.input_token_price?.price_per_million;
    const ao = m?.metadata?.pricing?.output_token_price?.price_per_million;
    if (String(ai) !== inp) fails.push(id + ' 输入价不符：HTML ' + inp + ' vs 接口 ' + ai);
    if (String(ao) !== outp) fails.push(id + ' 输出价不符：HTML ' + outp + ' vs 接口 ' + ao);
  }
  ok.push('高亮行 ' + rows.length + ' 条已与实时接口逐字段比对');
  if (rows.length < 3) fails.push('高亮比对行太少（' + rows.length + '），覆盖不足');

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

// 7. llms.txt 必须与两页同源披露
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

console.log(ok.map(x => '  ok  ' + x).join('\n'));
if (fails.length) { console.error('\nFAIL:\n' + fails.map(x => '  X  ' + x).join('\n')); process.exit(1); }
console.log('\nALL CHECKS PASSED');
