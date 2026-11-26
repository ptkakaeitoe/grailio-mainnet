// Live BSC mainnet check of the RPC log index. Skipped unless GRAILIO_LIVE=1:
//   GRAILIO_LIVE=1 node --test tests/log-index.live.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toEventSelector } from 'viem';
import { memoryStore } from '../lib/relay-limits.ts';
import { logReader, readList, syncIndex } from '../lib/log-index.ts';

const live = process.env.GRAILIO_LIVE === '1';
const d = JSON.parse(readFileSync(new URL('../deployments/56.json', import.meta.url)));
const start = BigInt(d.deployBlocks.collectChat);
const ROOM_ADDED = toEventSelector('RoomAdded(uint256,string,uint8,address,uint256,bool)');
const TIER_ADDED = toEventSelector('TierAdded(uint256,uint128,uint16[4],uint128[4])');
const ASSET_ADDED = toEventSelector('AssetAdded(uint256,address,address)');

test('reads the deploy-time events of the mainnet contracts over public RPCs', { skip: !live && 'set GRAILIO_LIVE=1' }, async () => {
  const reader = logReader([process.env.NEXT_PUBLIC_BSC_RPC_URL ?? 'https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com']);
  const store = memoryStore();
  const chat = d.collectChat.toLowerCase();
  const packs = d.collectPacks.toLowerCase();
  const cfg = {
    store, reader, ns: 'live', filter: { address: [packs, chat] }, startBlock: start, minIntervalMs: 0, maxChunks: 3,
    route: (log) => [{ list: log.address === chat ? 'chat' : 'packs', max: 1000 }],
  };
  const sync = await syncIndex(cfg);
  assert.ok(sync.synced, sync.error);
  const chatLogs = await readList(store, 'live', 'chat', 1000);
  const packLogs = await readList(store, 'live', 'packs', 1000);
  const count = (logs, topic) => logs.filter((l) => l.topics[0] === topic).length;
  const rooms = count(chatLogs, ROOM_ADDED), tiers = count(packLogs, TIER_ADDED), assets = count(packLogs, ASSET_ADDED);
  console.log(`blocks ${start}..${sync.cursor - 1n} (head ${sync.head}, span ${reader.span}): RoomAdded ${rooms}, TierAdded ${tiers}, AssetAdded ${assets}; first ${packLogs.at(-1)?.transactionHash} @ ${Number(packLogs.at(-1)?.timeStamp)}`);
  assert.ok(rooms > 0 && tiers > 0 && assets > 0);
});
