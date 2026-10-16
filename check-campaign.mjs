#!/usr/bin/env node
// Ask OpenCSG's own endpoints whether the invitation/credit programme is live,
// and write the verdict to campaign-status.json.
//
// Why this exists: the credit copy (02) is locked because the vendor announced
// the campaign closed. Locking it forever is also wrong - if a new round opens,
// nobody will remember to unlock it by hand. This makes the decision data-driven.
//
//   node check-campaign.mjs [--json]

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classify } from './campaign-status.mjs';

const BROADCASTS = 'https://opencsg.com/api/v1/broadcasts/active';
const CAMPAIGNS = 'https://opencsg.com/internal_api/campaigns?page=1&per=50&tag_name=';

async function get(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal, headers: { 'User-Agent': 'campaign-status-check/1.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// broadcasts/active 目前返回 {msg, data:{单个对象}}，不是数组。
// 两种形状都吃，且形状不认识时返回 null 让 classify 判 unknown——
// 把"我没解析出来"当成"没有 banner"会直接得出错误的 closed。
function asArray(payload, pick) {
  if (Array.isArray(payload)) return payload;
  const d = pick ? pick(payload) : payload?.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') return [d];
  return null;
}

let broadcasts = null;
let campaigns = null;
const fetchErrors = [];

try { broadcasts = asArray(await get(BROADCASTS), p => p?.data); }
catch (e) { fetchErrors.push('broadcasts: ' + e.message); }
try { campaigns = asArray(await get(CAMPAIGNS), p => p?.campaigns); }
catch (e) { fetchErrors.push('campaigns: ' + e.message); }

const r = fetchErrors.length === 2
  ? { state: 'unknown', why: '两个接口都没读到：' + fetchErrors.join('; '), evidence: [], notes: [] }
  : classify({ broadcasts: broadcasts ?? [], campaigns: campaigns ?? [] });

if (fetchErrors.length && !r.why.includes('两个接口')) {
  r.notes = r.notes || [];
  r.notes.push('部分接口读取失败，判据只基于拿到的那半边：' + fetchErrors.join('; '));
  if (r.state !== 'open') r.state = 'unknown';
}

const out = {
  checked_at: new Date().toISOString(),
  state: r.state,
  why: r.why,
  evidence: r.evidence,
  notes: r.notes || [],
  sources: [BROADCASTS, CAMPAIGNS],
};
writeFileSync(fileURLToPath(new URL('./campaign-status.json', import.meta.url)), JSON.stringify(out, null, 2) + '\n');

console.log(`campaign state: ${out.state} — ${out.why}`);
out.evidence.forEach(e => console.log('  · ' + e));
out.notes.forEach(n => console.log('  ! ' + n));
console.log('written: campaign-status.json');

// 退出码即"要不要人来看"：
//   0 closed  —— 已确认收官，额度文案保持锁定，无需动作
//   2 unknown —— 判不了，既不上线也不断言结束，要人确认
//   3 open    —— 出现在期活动，额度文案可以解锁（解锁本身仍是人的判断）
if (out.state === 'unknown') process.exitCode = 2;
else if (out.state === 'open') process.exitCode = 3;
