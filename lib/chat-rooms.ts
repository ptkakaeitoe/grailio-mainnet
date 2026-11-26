import { STOCK_ASSETS } from "./stock-assets.ts";

/**
 * The community room list, built from CollectChat's on-chain rooms.
 *
 * CollectChat card rooms (kind 2) are gated by `heldOf(author, gateId)` on the
 * staking contract, so a room belongs to a card asset by its gateId, not its
 * name. One stock room per entry in STOCK_ASSETS: it maps to the on-chain room
 * whose gateId is that stock's asset ID. The deployed contract takes new rooms
 * through `addRoom(name, Gate.Card, collectStaking, assetId, 1, true)` (owner
 * only, no redeploy); until that runs, the stock's room shows as not open yet.
 *
 * Open and token-gated rooms (the lounge, pack/edition rooms) stay on top.
 */

/** The fields of an on-chain room this list needs (see ChatRoom in lib/use-chat.ts). */
export type OnChainRoom = { id: number; name: string; kind: number; gateId: bigint; minBalance: bigint; encrypted: boolean };

export type RoomEntry<R extends OnChainRoom = OnChainRoom> = {
  /** Stable key: "room:<id>" for top rooms, "stock:<ticker>" for stock rooms. */
  key: string;
  /** The on-chain room; undefined while a stock's room isn't added yet. */
  room?: R;
  /** Card ticker that unlocks the room; null for open/pack rooms. */
  ticker: string | null;
  title: string;
  /** Company name for stock rooms. */
  subtitle?: string;
  /** Lounge and pack rooms: pinned above the card rooms. */
  top: boolean;
  /** Cards needed to enter (1 for card rooms). */
  minBalance: number;
};

const CARD_GATE = 2;

const stripTicker = (name: string) => name.replace(/^\$/, "");

/** Builds the sorted room list. `held` counts the wallet's cards per ticker (staked included). */
export function buildRoomList<R extends OnChainRoom>(rooms: R[], held: Record<string, number>): RoomEntry<R>[] {
  const cardRooms = rooms.filter((r) => r.kind === CARD_GATE);
  const top: RoomEntry<R>[] = rooms
    .filter((r) => r.kind !== CARD_GATE)
    .map((r) => ({ key: `room:${r.id}`, room: r, ticker: null, title: stripTicker(r.name), top: true, minBalance: Number(r.minBalance) }));

  const stocks: RoomEntry<R>[] = STOCK_ASSETS.map((s) => {
    const room = cardRooms.find((r) => r.gateId === BigInt(s.assetId));
    return { key: `stock:${s.ticker}`, room, ticker: s.ticker, title: s.ticker, subtitle: s.name, top: false, minBalance: room ? Number(room.minBalance) : 1 };
  });

  const canEnter = (e: RoomEntry<R>) => (e.ticker ? (held[e.ticker] ?? 0) >= Math.max(1, e.minBalance) : true);
  const cards = [...stocks].sort((a, b) => Number(canEnter(b)) - Number(canEnter(a)) || a.title.localeCompare(b.title));
  return [...top, ...cards];
}

/** Whether a wallet holding `held` cards may enter `entry` (open rooms: always). */
export const canEnterRoom = (entry: RoomEntry, held: Record<string, number>) =>
  entry.ticker === null || (held[entry.ticker] ?? 0) >= Math.max(1, entry.minBalance);
