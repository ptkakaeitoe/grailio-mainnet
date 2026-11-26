import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { cardArt, artOf, FABLE_CARDS, STOCK_CARDS } from '../lib/cards.ts';
import { STOCK_ASSETS, BASKETS, basketForTier } from '../lib/stock-assets.ts';

const TICKERS = STOCK_ASSETS.map((s) => s.ticker);

test('all Fable risk tiers use the four approved designs regardless of coin', async () => {
  const names = ['Coal Worker', 'Flame Smith', 'Cinder Knight', 'Ember King'];
  for (const tier of [0, 1, 2]) {
    for (const ticker of TICKERS) {
      for (let rarity = 0; rarity < 4; rarity++) {
        const art = cardArt(ticker, rarity, tier);
        assert.equal(art.name, names[rarity]);
        assert.equal(art.src, FABLE_CARDS[rarity].src);
        assert.equal(art.ticker, ticker);
        await access(new URL(`../public${art.src}`, import.meta.url));
      }
    }
  }
  assert.notEqual(cardArt('NVDA', 0).accent, cardArt('TSLA', 0).accent);
});

test('Saga uses its own four designs for every risk', async () => {
  const names = ['Deckhand', 'Raider', 'Captain', 'Pirate Lord'];
  for (const tier of [3, 4, 5]) {
    for (const ticker of TICKERS) {
      for (let rarity = 0; rarity < names.length; rarity++) {
        const art = cardArt(ticker, rarity, tier);
        assert.equal(art.name, names[rarity]);
        assert.match(art.src, /^\/art\/saga\//);
        assert.equal(art.src, cardArt('SPY', rarity, 3).src);
        assert.equal(artOf(ticker, rarity, tier).src, art.src);
        assert.equal(art.ticker, ticker);
        await access(new URL(`../public${art.src}`, import.meta.url));
      }
    }
  }
  assert.equal(cardArt('SPY', 99, 3).name, 'Deckhand');
});

test('Mythos uses its own creatures for all risks and coins', async () => {
  const names = ['Imp', 'Gargoyle', 'Wyrm', 'Ancient Dragon'];
  for (const tier of [6, 7, 8]) {
    for (const ticker of TICKERS) {
      for (let rarity = 0; rarity < names.length; rarity++) {
        const art = cardArt(ticker, rarity, tier);
        assert.equal(art.name, names[rarity]);
        assert.match(art.src, /^\/art\/mythos\//);
        assert.equal(art.src, cardArt('ANT', rarity, 6).src);
        assert.equal(artOf(ticker, rarity, tier).src, art.src);
        assert.equal(art.ticker, ticker);
        await access(new URL(`../public${art.src}`, import.meta.url));
      }
    }
  }
  assert.equal(cardArt('ANT', 99, 6).name, 'Imp');
});

test('pack art stays distinct and coin-only identities remain available', () => {
  assert.equal(artOf('NVDA').name, 'Silver Seed');
  assert.equal(cardArt('NVDA', 99, 0).name, 'Coal Worker');
  assert.equal(cardArt('NVDA', 0, 99).name, 'Silver Seed');
  assert.notEqual(cardArt('NVDA', 0, 0).src, cardArt('NVDA', 0, 3).src);
  assert.notEqual(cardArt('NVDA', 0, 3).src, cardArt('NVDA', 0, 6).src);
});

test('15 stocks, asset id = index, each edition draws from its own five', async () => {
  assert.equal(STOCK_ASSETS.length, 15);
  assert.equal(STOCK_CARDS.length, 15);
  STOCK_ASSETS.forEach((s, i) => assert.equal(s.assetId, i));
  assert.equal(STOCK_ASSETS[0].ticker, 'NVDA');
  assert.equal(STOCK_ASSETS[14].ticker, 'EWT');
  assert.deepEqual([0, 1, 2].map((t) => basketForTier(t)), [BASKETS.fable, BASKETS.fable, BASKETS.fable]);
  assert.deepEqual([3, 4, 5].map((t) => basketForTier(t)), [BASKETS.saga, BASKETS.saga, BASKETS.saga]);
  assert.deepEqual([6, 7, 8].map((t) => basketForTier(t)), [BASKETS.mythos, BASKETS.mythos, BASKETS.mythos]);
  const all = [...BASKETS.fable, ...BASKETS.saga, ...BASKETS.mythos];
  assert.deepEqual([...all].sort(), [...TICKERS].sort());
  for (const s of STOCK_ASSETS) await access(new URL(`../public${s.logo}`, import.meta.url));
});
