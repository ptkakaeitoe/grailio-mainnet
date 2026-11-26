import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverPurchases } from '../lib/pack-discovery.ts';

test('retains an old purchase after more than 40 global purchases; scans inclusive pages', async () => {
  const ranges = [];
  const result = await discoverPurchases({ fromBlock: 100n, toBlock: 4100n, fetchPage: async (from, to) => {
    ranges.push([from, to]);
    // Buyer-filtered RPC returns only this wallet's IDs, not the 100 IDs bought by others.
    return [{ id: 0n, blockNumber: 100n }, { id: 101n, blockNumber: 4100n }].filter(p => p.blockNumber >= from && p.blockNumber <= to);
  }});
  assert.deepEqual(result.purchases.map(p => p.id), [0n, 101n]);
  assert.deepEqual(ranges, [[100n, 2099n], [2100n, 4099n], [4100n, 4100n]]);
});

test('incremental polling retains old purchases and replaces reorganized recent logs without duplicates', async () => {
  const previous = { through: 5000n, purchases: [{ id: 0n, blockNumber: 100n }, { id: 8n, blockNumber: 4999n }] };
  const result = await discoverPurchases({ fromBlock: 100n, toBlock: 5005n, previous, fetchPage: async (from) => {
    assert.equal(from, 4937n);
    return [{ id: 9n, blockNumber: 5004n }, { id: 9n, blockNumber: 5004n }];
  }});
  assert.deepEqual(result.purchases.map(p => p.id), [0n, 9n]);
  assert.equal(previous.through, 5000n);
});

test('a failed page never advances or mutates the previous checkpoint', async () => {
  const previous = { through: 100n, purchases: [{ id: 0n, blockNumber: 100n }] };
  let calls = 0;
  await assert.rejects(discoverPurchases({ fromBlock: 100n, toBlock: 4100n, previous, fetchPage: async () => {
    if (++calls === 2) throw new Error('RPC unavailable');
    return [{ id: 1n, blockNumber: 101n }];
  }}), /RPC unavailable/);
  assert.deepEqual(previous, { through: 100n, purchases: [{ id: 0n, blockNumber: 100n }] });
});

test('empty history and a different wallet start without inherited IDs', async () => {
  const result = await discoverPurchases({ fromBlock: 100n, toBlock: 110n, fetchPage: async () => [] });
  assert.deepEqual(result.purchases, []);
});

test('backwards head discards the previous checkpoint', async () => {
  const result = await discoverPurchases({ fromBlock: 100n, toBlock: 120n, previous: { through: 5000n, purchases: [{ id: 8n, blockNumber: 4999n }] }, fetchPage: async (from) => { assert.equal(from, 100n); return []; } });
  assert.deepEqual(result.purchases, []);
});

test('cancelled scans do not publish a checkpoint', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(discoverPurchases({ fromBlock: 0n, toBlock: 10n, signal: controller.signal, fetchPage: async () => { throw Error('should not fetch'); } }), { name: 'AbortError' });
});
