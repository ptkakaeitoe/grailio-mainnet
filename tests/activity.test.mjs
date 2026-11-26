import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeEventTopics, encodeAbiParameters } from 'viem';
import { activityAbi, toActivity } from '../lib/activity.ts';

const me = '0x2C59a47Dc79c5468a8574e142e54C33906d4737d';
const other = '0x07a1944314f38ee5947301b0428958eaebde986a';
const nft = '0x92Dd466cd1bE08576937853Dc020291927D2221f';

/** A Routescan-style raw log for one event. */
function raw(eventName, args, data, { time = 100, i = 0 } = {}) {
  const ev = activityAbi.find((e) => e.name === eventName);
  const nonIndexed = ev.inputs.filter((p) => !p.indexed);
  return {
    address: nft,
    topics: encodeEventTopics({ abi: activityAbi, eventName, args }),
    data: nonIndexed.length ? encodeAbiParameters(nonIndexed, data) : '0x',
    timeStamp: '0x' + time.toString(16),
    transactionHash: '0x' + String(i).padStart(64, '0'),
    logIndex: '0x' + i.toString(16),
  };
}

test('decodes packs, staking and market events for the wallet, newest first', () => {
  const logs = [
    raw('PacksBought', { buyer: me, tierId: 0n }, [1n, 1n, 1_000_000n], { time: 100, i: 1 }),
    raw('PackOpened', { packId: 1n, cardId: 1n, owner: me }, [2, 1, 950_000n, false], { time: 110, i: 2 }),
    raw('Staked', { owner: me, cardId: 1n }, [2n], { time: 120, i: 3 }),
    raw('Claimed', { owner: me }, [1234n], { time: 130, i: 4 }),
    raw('Sold', { nft, tokenId: 5n, buyer: other }, [me, 2_000_000n, 20_000n, false], { time: 140, i: 5 }),
    // A sale between two other wallets is dropped.
    raw('Sold', { nft, tokenId: 6n, buyer: other }, [other, 1n, 0n, true], { time: 150, i: 6 }),
  ];
  const items = toActivity([...logs, logs[0]], me); // the duplicate is ignored
  assert.deepEqual(items.map((x) => x.kind), ['sold', 'claimed', 'staked', 'revealed', 'bought']);
  const [sold, claimed, , revealed, bought] = items;
  assert.equal(claimed.usdc, '1234');
  assert.equal(sold.cardId, '5');assert.equal(sold.amount, '2000000');assert.equal(sold.inAvax, false);
  assert.deepEqual([revealed.cardId, revealed.asset, revealed.rarity, revealed.usdc], ['1', 2, 1, '950000']);
  assert.deepEqual([bought.quantity, bought.tier, bought.usdc], [1, 0, '1000000']);
});

test('the buyer side of a sale is a purchase; unknown logs are skipped', () => {
  const sale = raw('Sold', { nft, tokenId: 7n, buyer: me }, [other, 3n, 0n, true], { i: 7 });
  const junk = { ...sale, topics: ['0x' + 'ab'.repeat(32)], transactionHash: '0x' + '9'.repeat(64) };
  const items = toActivity([sale, junk], me);
  assert.deepEqual(items.map((x) => [x.kind, x.inAvax]), [['purchased', true]]);
});
