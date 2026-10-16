// feed.xml（Atom 1.0）：把这三份已被守卫的读数交给聚合器/机器人自动订阅。
// 设计约束：
//  1) 不手抄——每条正文都从已受检的来源取（llms.txt 的 FACTS 段、audit.html 的 SUMMARY 段、
//     gateway-readings.json、data-snapshot.md、campaign-status.json）。
//  2) <updated> 用来源自己的日期，不用运行时刻 ⇒ 内容没变时文件逐字节不变（幂等）。
//  3) 活动收官这条**必须进 feed**：聚合器把"注册送 99 元"当现行权益转发，代价由读者承担。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rd = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const BASE = 'https://happy520ai.github.io/opencsg-model-pricing/';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const region = (html, tag) => {
  const m = html.match(new RegExp('<!--' + tag + ':START-->([\\s\\S]*?)<!--' + tag + ':END-->'));
  if (!m) throw new Error('REFUSED: 缺 ' + tag + ' 标记');
  return m[1].trim();
};

const llms = rd('./llms.txt');
const audit = rd('./audit.html');
const snap = rd('./data-snapshot.md');
if (!existsSync(fileURLToPath(new URL('./campaign-status.json', import.meta.url)))) {
  throw new Error('REFUSED: 没有 campaign-status.json —— 额度状态未知时更不许发 feed');
}
const campaign = JSON.parse(rd('./campaign-status.json'));
const gw = JSON.parse(rd('./gateway-readings.json'));
if (!gw.as_of || !campaign.checked_at || !campaign.state) throw new Error('REFUSED: 来源缺日期或状态');
const LEVELS = ['YES', 'NO', 'AUTH', 'ERR', 'UNKNOWN'];
const badLevel = (gw.results || []).filter(r => !LEVELS.includes(r.level));
if (badLevel.length) throw new Error('REFUSED: 出现未知判词 ' + badLevel.map(r => r.name + '=' + r.level).join('、'));

const facts = region(llms, 'FACTS').split('\n')
  .filter(l => !l.startsWith('以下三行') && l.trim()).join('\n');
const summary = region(audit, 'SUMMARY');
const snapDate = (snap.match(/核查日期：(\d{4}-\d{2}-\d{2})/) || [])[1];
if (!snapDate) throw new Error('REFUSED: data-snapshot.md 里读不到核查日期');
const rows = (gw.results || []).map(r => r.name + '：' + r.level +
  (r.total != null ? '（清单 ' + r.total + ' 条' + (r.hasPricing != null ? '，带价 ' + r.hasPricing + ' 条）' : '）') : ''));
if (rows.length < 5) throw new Error('REFUSED: 横评只有 ' + rows.length + ' 行');

const auditBody = summary + '\n\n' + rows.join('\n') +
  '\n\n复现：npx github:happy520ai/gateway-price-check --url <base_url> --name <名字>' +
  '（一次无鉴权 GET；五档判词里"我读不到 ERR"与"它没有 NO"是两件事，401 AUTH 算明确的否）';

const factsBody = 'OpenCSG /v1/models 免登录重放（' + snapDate + '）：\n' + facts +
  '\n\n重放：curl -s https://ai.space.opencsg.com/v1/models　清单会实时上下架，引用前请自行复核。';

const campaignBody = '状态：' + campaign.state + '。依据：' + campaign.why +
  '（读数生于 ' + campaign.checked_at + '，来源是厂商自己的 broadcasts/active 与 internal_api/campaigns）' +
  '\n因此不要把"注册送 50 元 / 邀请得 99 元"当现行权益转述。另：注册链接不会自动带入邀请码。';

const entry = (id, path, title, updated, body) =>
  '  <entry>\n' +
  '    <title>' + esc(title) + '</title>\n' +
  '    <id>' + esc(BASE + 'feed.xml#' + id) + '</id>\n' +
  '    <link href="' + esc(BASE + path) + '" />\n' +
  '    <updated>' + esc(updated) + 'T00:00:00Z</updated>\n' +
  '    <content type="text">' + esc(body.trim()) + '</content>\n' +
  '  </entry>\n';

// 从新到旧：横评（每日）→ 清单事实（每日）→ 活动状态（每日复核）。
const entries =
  entry('audit-' + gw.as_of, 'audit.html', '跨网关价格透明度横评 ' + gw.as_of, gw.as_of, auditBody) +
  entry('facts-' + snapDate, '', 'OpenCSG 清单与价格实测 ' + snapDate, snapDate, factsBody) +
  entry('campaign-' + campaign.checked_at.slice(0, 10), '',
    '邀请活动状态：' + campaign.state, campaign.checked_at.slice(0, 10), campaignBody);

const feed = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<feed xmlns="http://www.w3.org/2005/Atom">\n' +
  '  <title>OpenCSG 模型价格实测</title>\n' +
  '  <id>' + esc(BASE) + 'feed.xml</id>\n' +
  '  <link rel="alternate" href="' + esc(BASE) + '" />\n' +
  '  <link rel="self" href="' + esc(BASE) + 'feed.xml" />\n' +
  '  <updated>' + esc(gw.as_of) + 'T00:00:00Z</updated>\n' +
  '  <author><name>happy520ai</name></author>\n' +
  '  <rights>本页含个人邀请码利益披露；所有数字来自免登录重放，引用前请自行复核</rights>\n' +
  entries +
  '</feed>\n';

// 结构自检：feed 级 <updated> 必须等于最新 entry 的日期，否则说明排序或日期取错。
const ups = [...feed.matchAll(/<updated>([^<]+)<\/updated>/g)].map(m => m[1]).sort();
if (ups[ups.length - 1] !== esc(gw.as_of) + 'T00:00:00Z') {
  throw new Error('REFUSED: feed 级 updated 不等于最新 entry 的日期（' + ups.join(',') + '）');
}
const OUT = fileURLToPath(new URL('./feed.xml', import.meta.url));
let prev = '';
try { prev = readFileSync(OUT, 'utf8'); } catch (e) { /* 首次生成 */ }
if (prev !== feed) writeFileSync(OUT, feed);
console.log((prev === feed ? 'feed.xml 未变' : 'feed.xml 已重建') + '：' + feed.length + ' 字符，3 条 entry，横评 ' + rows.length + ' 行');
