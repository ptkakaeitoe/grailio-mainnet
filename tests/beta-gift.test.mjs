import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.BETA_COOKIE_SECRET = 'test-secret-at-least-16-chars';
process.env.BETA_ACCESS_CODES = 'alpha,beta';
const { BETA_GATE_ON, tokenForCode, tokenForGift, validToken } = await import('../lib/beta-gate.ts');

// With the gate switched off (BETA_GATE_ON = false) every token is accepted, so these checks only apply when it's on.
const gate = { skip: BETA_GATE_ON ? false : 'beta gate is off' };

test('a gift token unlocks, and only for its own signer', gate, async () => {
  const signer = '0x07a1944314f38ee5947301b0428958eaebde986a';
  const token = await tokenForGift(signer);
  assert.ok(token.startsWith(`gift.${signer}.`));
  assert.equal(await validToken(token), true);
  // Same MAC with another signer, or a tampered MAC, is refused.
  assert.equal(await validToken(token.replace(signer, '0x' + '1'.repeat(40))), false);
  assert.equal(await validToken(token.slice(0, -1) + (token.endsWith('0') ? '1' : '0')), false);
  assert.equal(await validToken('gift.only-two'), false);
});

test('beta codes still work alongside gift tokens', gate, async () => {
  assert.equal(await validToken(await tokenForCode('alpha')), true);
  assert.equal(await tokenForCode('nope'), null);
});
