import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../lib/relay-limits.ts';
import { isRangeError, logReader, readList, syncIndex } from '../lib/log-index.ts';

const hex = (n) => `0x${n.toString(16)}`;
const HEAD = 10_000;
// One log every 500 blocks; topics[1] names its list.
const chainLogs = Array.from({ length: 20 }, (_, i) => ({
  address: '0xc0de', topics: ['0xaa', i % 2 ? '0x01' : '0x02'], data: '0x', blockNumber: hex(i * 500 + 1),
  blockTimestamp: hex(1000 + i), transactionHash: `0x${i}`, logIndex: '0x0',
}));

/** Two fake RPCs: the first refuses getLogs (like bsc-dataseed), the second caps ranges at 1,000 blocks. */
function fakeFetch(calls) {
  return async (url, init) => {
    const { method, params } = JSON.parse(init.body);
    calls.push(`${url}:${method}`);
    const reply = (body) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }));
    if (method === 'eth_blockNumber') return reply({ result: hex(HEAD) });
    if (url === 'a') return reply({ error: { code: -32005, message: 'limit exceeded' } });
    const from = Number(params[0].fromBlock), to = Number(params[0].toBlock);
    if (to - from + 1 > 1000) return reply({ error: { code: -32602, message: 'query exceeds max block range 1000' } });
    return reply({ result: chainLogs.filter((l) => Number(l.blockNumber) >= from && Number(l.blockNumber) <= to) });
  };
}

const config = (store, reader, extra = {}) => ({
  store, reader, ns: 't', filter: { address: '0xc0de' }, startBlock: 1n, confirmations: 0, minIntervalMs: 0,
  route: (log) => [{ list: log.topics[1], max: 5 }], ...extra,
});

test('range errors are told apart from lagging nodes', () => {
  assert.ok(isRangeError(new Error('query exceeds max block range 10000')));
  assert.ok(isRangeError(new Error('limit exceeded')));
  assert.ok(!isRangeError(new Error('block range extends beyond current head block')));
  assert.ok(!isRangeError(new Error('RPC 503')));
});

test('falls back across endpoints, shrinks the chunk, and resumes from the cursor', async () => {
  const calls = [];
  const reader = logReader(['a', 'b'], { maxSpan: 4000, fetcher: fakeFetch(calls) });
  const store = memoryStore();
  const first = await syncIndex(config(store, reader, { maxChunks: 3 }));
  assert.equal(reader.span, 1000);
  assert.equal(first.cursor, 3001n);
  assert.equal(first.behind, true);
  const second = await syncIndex(config(store, reader, { maxChunks: 100 }));
  assert.equal(second.cursor, BigInt(HEAD + 1));
  assert.equal(second.behind, false);
  // Capped per list, newest first, with block times.
  const odd = await readList(store, 't', '0x01', 50);
  assert.deepEqual(odd.map((l) => l.transactionHash), ['0x19', '0x17', '0x15', '0x13', '0x11']);
  assert.equal(odd[0].timeStamp, hex(1019));
  // After the first success the working endpoint is tried first.
  const after = calls.slice(calls.lastIndexOf('a:eth_getLogs') + 1);
  assert.ok(after.length > 5 && after.every((c) => c.startsWith('b:')));
});

test('concurrent syncs never double events', async () => {
  const reader = logReader(['b'], { maxSpan: 1000, fetcher: fakeFetch([]) });
  const store = memoryStore();
  await Promise.all(Array.from({ length: 5 }, () => syncIndex(config(store, reader, { maxChunks: 100 }))));
  await syncIndex(config(store, reader, { maxChunks: 100 }));
  const even = await store.list('t:l:0x02', 50);
  assert.equal(new Set(even).size, even.length);
  assert.equal(even.length, 5);
});

test('an RPC outage is reported, not thrown', async () => {
  const reader = logReader(['a'], { fetcher: fakeFetch([]) });
  const out = await syncIndex(config(memoryStore(), reader));
  assert.equal(out.synced, false);
  assert.match(out.error, /limit exceeded/);
});
