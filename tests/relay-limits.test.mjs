import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLimits, memoryStore, withSendLock, limitStore } from '../lib/relay-limits.ts';

const limits = { perMinute: 2, perDay: 3, dailyTotal: 4 };
const t0 = Date.UTC(2026, 10, 22, 12, 0, 0);

test('per-wallet minute and day limits, then a shared daily total', async () => {
  const s = memoryStore();
  assert.equal(await checkLimits(s, 'a', limits, t0), null);
  assert.equal(await checkLimits(s, 'a', limits, t0), null);
  assert.match(await checkLimits(s, 'a', limits, t0), /Slow down/); // 3rd in the same minute
  assert.equal(await checkLimits(s, 'a', limits, t0 + 60_000), null); // next minute: 3rd of the day
  assert.match(await checkLimits(s, 'a', limits, t0 + 120_000), /Daily message limit/);
  // Refused requests from "a" didn't use up the shared total: b gets the last slot.
  assert.equal(await checkLimits(s, 'b', limits, t0), null);
  assert.match(await checkLimits(s, 'c', limits, t0), /paused for today/);
});

test('the send lock lets one task run at a time and always releases', async () => {
  const s = memoryStore();
  const order = [];
  const slow = withSendLock(s, async () => { order.push('a-start'); await new Promise(r => setTimeout(r, 300)); order.push('a-end'); });
  await new Promise(r => setTimeout(r, 20));
  const fast = withSendLock(s, async () => { order.push('b'); });
  await Promise.all([slow, fast]);
  assert.deepEqual(order, ['a-start', 'a-end', 'b']);
  await assert.rejects(withSendLock(s, async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await withSendLock(s, async () => 'free again'), 'free again');
  // A lock held elsewhere times out instead of waiting forever.
  await s.lock('relay:lock', 'other', 10_000);
  await assert.rejects(withSendLock(s, async () => 'x', 200), /busy/);
});

test('production refuses to relay without a shared store', () => {
  const env = { ...process.env };
  try {
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL; delete process.env.RELAY_ALLOW_MEMORY_LIMITS;
    process.env.NODE_ENV = 'production';
    assert.equal(limitStore(), null);
    process.env.RELAY_ALLOW_MEMORY_LIMITS = '1';
    assert.ok(limitStore());
  } finally {
    process.env = env;
  }
});
