import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../campaign-status.mjs';

const NOW = Date.parse('2026-10-17T00:00:00Z');
const BANNER = { id: 4, bc_type: 'banner', status: 'active', content: '感谢大家热情参与！本期"邀请注册有礼"活动已于 [10月16日 24:00] 圆满收官。' };

test('收官 banner + 无在期活动 => closed', () => {
  const r = classify({ broadcasts: [BANNER], campaigns: [], now: NOW });
  assert.equal(r.state, 'closed');
  assert.match(r.why, /收官/);
});

test('在期邀请活动存在 => open，即使同时挂着收官 banner', () => {
  const r = classify({
    broadcasts: [BANNER],
    campaigns: [{ name: '新一期邀请注册有礼', status: 'in_progress', end_date: '2026-12-01T00:00:00Z' }],
    now: NOW,
  });
  assert.equal(r.state, 'open');
});

// 必中靶：官方台账实测存在 end_date 已过却仍标 signing_up 的条目。
// 若只信 status，这里会被误判成 open，于是重新上线过期额度承诺。
test('status 未结束但 end_date 已过 => 仍判 closed，并注明忽略了 status', () => {
  const r = classify({
    broadcasts: [BANNER],
    campaigns: [{ name: '邀请注册有礼', status: 'signing_up', end_date: '2025-12-30T16:00:00Z' }],
    now: NOW,
  });
  assert.equal(r.state, 'closed');
  assert.ok(r.notes.some(n => /忽略这些条目的 status/.test(n)));
});

// 必中靶：既没收官告示也没在期活动时，不许猜。
// 猜成 open 会上线可能已失效的额度；猜成 closed 会永久锁住可能仍在的权益。
test('无 banner 无活动 => unknown，两向都不许下结论', () => {
  const r = classify({ broadcasts: [], campaigns: [], now: NOW });
  assert.equal(r.state, 'unknown');
  assert.match(r.why, /不能推断/);
});

test('非 banner 类型的收官文案不算证据', () => {
  const r = classify({
    broadcasts: [{ id: 9, bc_type: 'popup', status: 'active', content: BANNER.content }],
    campaigns: [], now: NOW,
  });
  assert.equal(r.state, 'unknown');
});

test('接口形状变化 => unknown 而不是崩', () => {
  assert.equal(classify({ broadcasts: null, campaigns: [], now: NOW }).state, 'unknown');
  assert.equal(classify({ broadcasts: [], campaigns: {}, now: NOW }).state, 'unknown');
  assert.equal(classify({}).state, 'unknown');
});

test('banner 被官方下线(status!=active) => 不再当作收官证据', () => {
  const r = classify({
    broadcasts: [{ ...BANNER, status: 'inactive' }],
    campaigns: [], now: NOW,
  });
  assert.equal(r.state, 'unknown');
});
