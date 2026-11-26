import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomList } from '../lib/chat-rooms.ts';
import { STOCK_ASSETS } from '../lib/stock-assets.ts';

const room = (id, name, kind, gateId = 0n) => ({ id, name, kind, gateId, minBalance: kind ? 1n : 0n, encrypted: kind === 2 });
// Lounge plus rooms for AAPL (asset 1) and TSLA (asset 2).
const onChain = [room(0, 'The lounge', 0), room(1, 'AAPL', 2, 1n), room(2, 'TSLA', 2, 2n)];

test('lounge on top, one room per stock mapped by asset id', () => {
  const list = buildRoomList(onChain, {});
  assert.equal(list[0].title, 'The lounge');
  const stocks = list.filter((e) => e.key.startsWith('stock:'));
  assert.equal(stocks.length, STOCK_ASSETS.length);
  assert.equal(stocks.length, 15);
  assert.equal(stocks.find((e) => e.ticker === 'AAPL').room.id, 1);
  assert.equal(stocks.find((e) => e.ticker === 'NVDA').room, undefined);
  // Sorted by ticker when nothing is held.
  const tickers = stocks.map((e) => e.ticker);
  assert.deepEqual(tickers, [...tickers].sort((a, b) => a.localeCompare(b)));
});

test('rooms you can enter come first', () => {
  const list = buildRoomList(onChain, { TSLA: 1, EWT: 2 });
  assert.equal(list[0].title, 'The lounge');
  assert.deepEqual(list.slice(1, 3).map((e) => e.ticker), ['EWT', 'TSLA']);
  assert.equal(list[2].room.id, 2);
});
