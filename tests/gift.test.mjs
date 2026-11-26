import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recoverMessageAddress } from 'viem';
import { newLiveCode, newDemoCode, parseCode, giftAccount, normalizeCode } from '../lib/gift-code.ts';
import { initialDemo, buyDemoGift, claimDemoGift, cancelDemoGift } from '../lib/demo-economy.ts';

test('live codes parse back to the same signing key, forgiving case, dashes and look-alikes', async () => {
  const { code, signer } = newLiveCode();
  assert.match(code, /^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
  const parsed = parseCode(code.toLowerCase().replace(/-/g, ' '));
  assert.equal(parsed.kind, 'live');
  assert.equal(giftAccount(parsed.secret).address, signer);
  // The claim signature recovers to the stored signer (what CollectPacks checks).
  const msg = '0x' + '11'.repeat(32);
  const sig = await giftAccount(parsed.secret).signMessage({ message: { raw: msg } });
  assert.equal(await recoverMessageAddress({ message: { raw: msg }, signature: sig }), signer);
  assert.equal(normalizeCode('o1-Il'), '0111');
  assert.equal(parseCode('not a code'), null);
  assert.equal(parseCode(code.slice(0, -3)), null);
});

test('demo codes carry the pack type and count', () => {
  const code = newDemoCode(2, 3);
  assert.match(code, /^DEMO-203-/);
  assert.deepEqual({ ...parseCode(code), secret: undefined }, { kind: 'demo', tier: 2, quantity: 3, secret: undefined });
  assert.equal(parseCode('DEMO-200-ABC'), null);
  assert.equal(parseCode(newDemoCode(1, 1).replace('-101-', '-111-')), null); // 11 packs is over the limit
});

test('demo gifts: paid like packs, claimed once, cancel returns the packs', () => {
  const tier = { id: 1, price: 1, odds: [50, 25, 20, 5], backing: [0.46, 0.8, 1.4, 4] };
  const start = initialDemo();
  const bought = buyDemoGift(start, tier, 3, 'USDC', 1, 'DEMO-103-X', 0);
  assert.equal(bought.balances.USDC, start.balances.USDC - 3);
  assert.equal(bought.packs.length, 0); // not yours: held for the code
  assert.equal(bought.gifts[0].status, 'open');
  assert.equal(buyDemoGift({ ...start, balances: { ...start.balances, USDC: 1 } }, tier, 3, 'USDC', 1, 'C', 0), null);

  const claimed = claimDemoGift(start, 'DEMO-103-Y', 1, 3); // someone else's code, in this browser
  assert.deepEqual(claimed.packs, [1, 1, 1]);
  assert.equal(claimed.balances.PACK, 3);
  assert.equal(claimDemoGift(claimed, 'DEMO-103-Y', 1, 3), null); // once per browser

  const cancelled = cancelDemoGift(bought, 'DEMO-103-X');
  assert.deepEqual(cancelled.packs, [1, 1, 1]);
  assert.equal(cancelled.gifts[0].status, 'cancelled');
  assert.equal(cancelDemoGift(cancelled, 'DEMO-103-X'), null);
  assert.equal(claimDemoGift(cancelled, 'DEMO-103-X', 1, 3), null); // a cancelled own gift can't be claimed
});

test('collector points: 1 per pack bought, gifts included', () => {
  const tier = { id: 1, price: 1, odds: [50, 25, 20, 5], backing: [0.46, 0.8, 1.4, 4] };
  const start = initialDemo();
  assert.equal(start.points, 0);
  const bought = buyDemoGift(start, tier, 2, 'USDC', 1, 'DEMO-102-P', 0);
  assert.equal(bought.points, 2);
});
