import { test } from 'node:test';
import assert from 'node:assert/strict';
import { txErrorMessage } from '../lib/tx-error.ts';

test('not enough BNB for gas gets a plain message', () => {
  const viem = Object.assign(new Error('The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.'), { shortMessage: 'The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.' });
  assert.match(txErrorMessage(viem), /Not enough BNB for gas/);
  assert.match(txErrorMessage(new Error('insufficient funds for gas * price + value')), /Not enough BNB for gas/);
  assert.equal(txErrorMessage(new Error('User rejected the request.')), 'Cancelled in your wallet.');
});
