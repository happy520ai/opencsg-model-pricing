// Pure classification: given the two official endpoints' payloads, is the
// invitation/credit programme closed, open, or genuinely undecidable?
// Kept network-free so it can be tested against fixtures, including fixtures
// that must make it refuse to conclude.

const CLOSE_RE = /邀请注册有礼[\s\S]*收官|收官[\s\S]*邀请注册有礼/;
const INVITE_NAME_RE = /邀请|注册有礼/;

function isoFuture(s, now) {
  if (!s) return false;
  const t = Date.parse(s);
  return Number.isFinite(t) && t > now;
}

export function classify({ broadcasts, campaigns, now = Date.now() } = {}) {
  const notes = [];

  if (!Array.isArray(broadcasts)) {
    return { state: 'unknown', why: 'broadcasts 响应不是数组（接口形状变了）', evidence: [] };
  }
  if (!Array.isArray(campaigns)) {
    return { state: 'unknown', why: 'campaigns 响应不是数组（接口形状变了）', evidence: [] };
  }

  const banners = broadcasts.filter(b => b && /banner/i.test(b.bc_type || ''));
  const closing = banners.filter(b => CLOSE_RE.test(String(b.content || '')));
  const liveBanners = closing.filter(b => (b.status || 'active') === 'active');

  const inviteCampaigns = campaigns.filter(c => INVITE_NAME_RE.test(String(c.name || '')));
  const liveCampaigns = inviteCampaigns.filter(c =>
    (c.status && c.status !== 'ended') && isoFuture(c.end_date, now));

  const evidence = [
    ...liveBanners.map(b => 'active banner(id=' + b.id + '): ' + String(b.content).slice(0, 60)),
    ...liveCampaigns.map(c => 'campaign: ' + c.name + ' 至 ' + c.end_date),
  ];

  // 关键一条：官方台账的 status 和 end_date 会互相矛盾（实测有 end_date 已过
  // 却仍标 signing_up 的条目）。所以日期说了算，status 单独不算证据。
  const staleStatus = inviteCampaigns
    .filter(c => c.status && c.status !== 'ended' && !isoFuture(c.end_date, now))
    .map(c => c.name);
  if (staleStatus.length) {
    notes.push('忽略这些条目的 status，因其 end_date 已过：' + staleStatus.join('、'));
  }

  if (liveCampaigns.length > 0) {
    return { state: 'open', why: '存在在期的邀请类活动', evidence, notes };
  }
  if (liveBanners.length > 0) {
    return { state: 'closed', why: '官方 active banner 宣布收官，且在期邀请活动 0 条', evidence, notes };
  }
  // 既没有收官告示，也没有在期活动 => 真的不知道，不许猜成"开放"或"关闭"。
  return { state: 'unknown', why: '无收官 banner 也无在期邀请活动，不能推断额度是否可用', evidence, notes };
}
