import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { cardArt, artOf, FABLE_CARDS } from '../lib/cards.ts';

test('all Fable risk tiers use the four approved designs regardless of coin', async () => {
  const names = ['Coal Worker', 'Flame Smith', 'Cinder Knight', 'Ember King'];
  for (const tier of [0, 1, 2]) {
    for (const ticker of ['BTC', 'ETH', 'WBNB', 'LINK', 'CAKE', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN']) {
      for (let rarity = 0; rarity < 4; rarity++) {
        const art = cardArt(ticker, rarity, tier);
        assert.equal(art.name, names[rarity]);
        assert.equal(art.src, FABLE_CARDS[rarity].src);
        assert.equal(art.ticker, ticker);
        await access(new URL(`../public${art.src}`, import.meta.url));
      }
    }
  }
  assert.notEqual(cardArt('BTC', 0).accent, cardArt('ETH', 0).accent);
});

test('Saga uses its own four designs for every risk and the retired duplicate tier', async () => {
  const names = ['Deckhand', 'Raider', 'Captain', 'Pirate Lord'];
  for (const tier of [3, 4, 6, 7]) {
    for (const ticker of ['BTC', 'ETH', 'WBNB', 'LINK', 'CAKE', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN']) {
      for (let rarity = 0; rarity < names.length; rarity++) {
        const art = cardArt(ticker, rarity, tier);
        assert.equal(art.name, names[rarity]);
        assert.match(art.src, /^\/art\/saga\//);
        assert.equal(art.src, cardArt('BTC', rarity, 3).src);
        assert.equal(artOf(ticker, rarity, tier).src, art.src);
        assert.equal(art.ticker, ticker);
        await access(new URL(`../public${art.src}`, import.meta.url));
      }
    }
  }
  assert.equal(cardArt('BTC', 99, 3).name, 'Deckhand');
});

test('Mythos uses its own creatures for all risks and coins', async () => {
  const names = ['Imp', 'Gargoyle', 'Wyrm', 'Ancient Dragon'];
  for (const tier of [5, 8, 9]) {
    for (const ticker of ['BTC', 'ETH', 'WBNB', 'LINK', 'CAKE', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN']) {
      for (let rarity = 0; rarity < names.length; rarity++) {
        const art = cardArt(ticker, rarity, tier);
        assert.equal(art.name, names[rarity]);
        assert.match(art.src, /^\/art\/mythos\//);
        assert.equal(art.src, cardArt('BTC', rarity, 5).src);
        assert.equal(artOf(ticker, rarity, tier).src, art.src);
        assert.equal(art.ticker, ticker);
        await access(new URL(`../public${art.src}`, import.meta.url));
      }
    }
  }
  assert.equal(cardArt('BTC', 99, 5).name, 'Imp');
});

test('pack art stays distinct and older coin-only identities remain available', () => {
  assert.equal(artOf('BTC').name, 'Silver Seed');
  assert.equal(cardArt('BTC', 99, 0).name, 'Coal Worker');
  assert.equal(cardArt('BTC', 0, 99).name, 'Silver Seed');
  assert.notEqual(cardArt('BTC', 0, 0).src, cardArt('BTC', 0, 3).src);
  assert.notEqual(cardArt('BTC', 0, 3).src, cardArt('BTC', 0, 5).src);
});
