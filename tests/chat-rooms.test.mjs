import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomList } from '../lib/chat-rooms.ts';
import { STOCK_ASSETS } from '../lib/stock-assets.ts';

const room = (id, name, kind, gateId = 0n) => ({ id, name, kind, gateId, minBalance: kind ? 1n : 0n, encrypted: kind === 2 });
// The deployed rooms: lounge + the five original token rooms, plus AAPL (asset 7) added later.
const onChain = [
  room(0, 'The lounge', 0),
  ...['$BTC', '$ETH', '$WBNB', '$LINK', '$CAKE'].map((n, i) => room(i + 1, n, 2, BigInt(i))),
  room(6, 'AAPL', 2, 7n),
];

test('lounge on top, one room per stock mapped by asset id', () => {
  const list = buildRoomList(onChain, {});
  assert.equal(list[0].title, 'The lounge');
  const stocks = list.filter((e) => e.key.startsWith('stock:'));
  assert.equal(stocks.length, STOCK_ASSETS.length);
  assert.equal(stocks.find((e) => e.ticker === 'AAPL').room.id, 6);
  assert.equal(stocks.find((e) => e.ticker === 'NVDA').room, undefined);
  // Old token rooms are hidden without a card.
  assert.ok(!list.some((e) => e.ticker === 'BTC'));
  // Sorted by ticker when nothing is held.
  const tickers = stocks.map((e) => e.ticker);
  assert.deepEqual(tickers, [...tickers].sort((a, b) => a.localeCompare(b)));
});

test('rooms you can enter come first; old token rooms show for holders', () => {
  const list = buildRoomList(onChain, { TSLA: 1, BTC: 2 });
  assert.equal(list[0].title, 'The lounge');
  assert.deepEqual(list.slice(1, 3).map((e) => e.ticker), ['BTC', 'TSLA']);
  assert.equal(list[1].room.id, 1);
});
