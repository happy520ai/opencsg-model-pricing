#!/usr/bin/env node
// Fill the audit page's tables with a STATIC snapshot so that readers who do not
// execute JavaScript - search crawlers on first pass, and AI assistants asked
// "which gateways publish prices without an account" - see real numbers instead
// of "加载中…". Browsers that can run JS still overwrite it with live readings.
//
// The block is generated, never hand-typed: a hand-copied fallback is just
// another number nobody re-verifies.
//
//   node embed-readings.mjs <readings.json> [target.html]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = process.argv[2];
if (!SRC) { console.error('用法：node embed-readings.mjs <readings.json> [audit.html]'); process.exitCode = 2; throw new Error('missing arg'); }
const TARGET = fileURLToPath(new URL(process.argv[3] ?? './audit.html', import.meta.url));

const doc = JSON.parse(readFileSync(fileURLToPath(new URL(SRC, import.meta.url).href), 'utf8'));
const rows = doc.results || [];
if (rows.length === 0) { console.error('REFUSED: 读数里 0 行，不写空表'); process.exitCode = 1; throw new Error('empty readings'); }
if (!doc.as_of) { console.error('REFUSED: 读数没有 as_of，无法标注快照日期'); process.exitCode = 1; throw new Error('no date'); }

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const tr = r => '      <tr><td>' + esc(r.name) + '</td><td>' + (r.total ?? '—') + '</td><td>' +
  (r.hasPricing != null ? r.hasPricing + '/' + r.total : '—') + '</td><td style="text-align:left">' +
  esc(r.verdict) + '</td></tr>';

const START = '<!--READINGS:START-->';
const END = '<!--READINGS:END-->';
const block = START + '\n' + rows.map(tr).join('\n') + '\n      ' + END;

// 两张表都要静态化：一张是本页自测的 7 列读数，一张是工具产出的 11 家横评。
// 静态化不等于手抄——两个区块都由本脚本从各自的 JSON 生成，check-site.mjs 会
// 拿实时值复核，所以对"无 JS 读者可见"和"数字不会过期"这两条不再互相矛盾。
const OWN = JSON.parse(readFileSync(fileURLToPath(new URL('./audit-latest.json', import.meta.url)), 'utf8'));
const ownTr = r => '      <tr><td>' + esc(r.name) + '</td><td>' + (r.total ?? '—') + '</td><td>' + (r.inputPriced ?? '—') +
  '</td><td>' + (r.priced ?? '—') + '</td><td>' + (r.cache ?? '—') + '</td><td>' + (r.currencyField ?? '—') +
  '</td><td>' + (r.upstream ?? '—') + '</td></tr>';

function fill(html, tag, body) {
  const S = '<!--' + tag + ':START-->', E = '<!--' + tag + ':END-->';
  const ns = (html.match(new RegExp(S, 'g')) || []).length;
  const ne = (html.match(new RegExp(E, 'g')) || []).length;
  if (ns !== 1 || ne !== 1) {
    console.error(`REFUSED: ${tag} 标记应各 1 个，实际 ${ns}/${ne} —— 不猜落点`);
    process.exitCode = 1; throw new Error('bad markers: ' + tag);
  }
  const block = S + '\n' + body.join('\n') + '\n      ' + E;
  const out = html.replace(new RegExp(S + '[\\s\\S]*?' + E), () => block);
  if (out.replace(new RegExp(S + '[\\s\\S]*?' + E), () => block) !== out) {
    console.error('REFUSED: ' + tag + ' 非幂等'); process.exitCode = 1; throw new Error('not idempotent: ' + tag);
  }
  return out;
}

let html = readFileSync(TARGET, 'utf8');
html = fill(html, 'READINGS', rows.map(tr));
const ownRows = OWN.rows || [];
if (ownRows.length === 0) { console.error('REFUSED: audit-latest.json 无行'); process.exitCode = 1; throw new Error('empty own'); }
html = fill(html, 'OWNREADINGS', ownRows.map(ownTr));
writeFileSync(TARGET, html);
console.log(`embedded ${rows.length} wide rows + ${ownRows.length} own rows (wide as_of ${doc.as_of} ${doc.as_of_tz ?? ''})`);
