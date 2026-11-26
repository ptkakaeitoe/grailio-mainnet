import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../lib/relay-limits.ts';
import { rememberRecent, recentMessages, RECENT_MAX, RECENT_TTL } from '../lib/chat-recent.ts';

const msg = (roomId, n, time) => ({ roomId, author: '0xabc', body: `0x0${n}`, salt: `0x1${n}`, hash: `0x2${n}`, time });

test('recent messages come back per room, oldest first', async () => {
  const store = memoryStore();
  const now = 1_000_000_000_000;
  const t = Math.floor(now / 1000);
  await rememberRecent(store, msg(1, 1, t - 5));
  await rememberRecent(store, msg(2, 2, t - 4));
  await rememberRecent(store, msg(1, 3, t - 3));
  const room1 = await recentMessages(store, 1, now);
  assert.deepEqual(room1.map((m) => m.body), ['0x01', '0x03']);
  assert.deepEqual((await recentMessages(store, 2, now)).map((m) => m.body), ['0x02']);
  assert.deepEqual(await recentMessages(store, 3, now), []);
});

test('entries older than the TTL are dropped and the list is capped', async () => {
  const store = memoryStore();
  const now = Date.now();
  const t = Math.floor(now / 1000);
  await rememberRecent(store, msg(1, 'old', t - RECENT_TTL - 1));
  await rememberRecent(store, msg(1, 'new', t));
  assert.deepEqual((await recentMessages(store, 1, now)).map((m) => m.body), ['0x0new']);
  for (let i = 0; i < RECENT_MAX + 5; i++) await rememberRecent(store, msg(1, i, t));
  const all = await recentMessages(store, 1, now);
  assert.equal(all.length, RECENT_MAX);
  assert.equal(all.at(-1).body, `0x0${RECENT_MAX + 4}`);
});
