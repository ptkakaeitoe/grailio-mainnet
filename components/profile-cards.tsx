"use client";

import { cardArt } from "@/lib/cards";
import Link from "next/link";
import type { Address } from "viem";

import { useDemo } from "@/components/demo-provider";
import { StockCardFront } from "@/components/stock-card-front";
import { collectPacksLive } from "@/lib/collect-packs";
import { RARITY_NAMES } from "@/lib/contracts";
import { useRedeemedCards } from "@/lib/use-collect-market";
import { useStockCards } from "@/lib/use-stock-cards";
import { usd, useStockPrices } from "@/lib/use-stock-prices";

/** Where a card stands: earning in staking, up for sale, or still holding USDT until filled. */
type CardStatus = "Staked" | "Listed" | "Unfilled";
type Owned = { key: string; ticker: string; rarity: number; tier: number; value: number | null; status?: CardStatus };

const statusOf = (c: { staked: boolean; listPrice: number | null; filled: boolean }): CardStatus | undefined =>
  c.staked ? "Staked" : c.listPrice != null ? "Listed" : !c.filled ? "Unfilled" : undefined;

/** How many cards the profile shows before "+N more". */
const SHOWN = 10;

/** Your cards at a glance on the profile; Collection is where you act on them. */
export function ProfileCards({ account }: { account?: Address }) {
  const demo = useDemo();
  if (demo.active) return <><DemoCards /><DemoRedeemed /></>;
  return account && collectPacksLive ? <><LiveCards account={account} /><LiveRedeemed account={account} /></> : <CardGrid cards={[]} />;
}

type Burned = { key: string; ticker: string; rarity: number; tier: number; amount: number };

function DemoRedeemed() {
  const demo = useDemo();
  return <RedeemedGrid cards={[...demo.redeemed].reverse().map((c) => ({ key: String(c.id), ticker: c.ticker, rarity: c.rarity, tier: c.tier, amount: c.amount }))} />;
}

/** Someone's redeemed cards, on their profile. */
export function LiveRedeemed({ account }: { account: Address }) {
  const { cards } = useRedeemedCards(account);
  return <RedeemedGrid cards={cards.map((c) => ({ key: String(c.id), ticker: c.ticker, rarity: c.rarity, tier: c.tier, amount: c.amount }))} />;
}

const amountText = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 4 });

/**
 * Cards that were redeemed: burned for their tokens, so not tradable, but kept
 * as part of the collection's history. Faded, with what each paid out.
 */
function RedeemedGrid({ cards }: { cards: Burned[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="redeemed-title">
      <h3 id="redeemed-title" className="mb-3 text-sm text-muted">Redeemed · {cards.length}</h3>
      <ul className="grid list-none grid-cols-4 gap-3 p-0 phone:grid-cols-5 desk:grid-cols-6">
        {cards.map((c) => {
          const art = cardArt(c.ticker, c.rarity, c.tier);
          if (!art) return null;
          return (
            <li key={c.key} className="min-w-0" aria-label={`${art.name}, ${RARITY_NAMES[c.rarity]}, redeemed for ${amountText(c.amount)} ${c.ticker}`}>
              <div className="relative opacity-55 grayscale">
                <StockCardFront art={art} rarity={c.rarity} decorative sizes="(max-width: 480px) 22vw, 110px" className="w-full" />
              </div>
              <span className="mt-1.5 block truncate text-[13px] text-muted">{RARITY_NAMES[c.rarity]}</span>
              <span className="block truncate text-[13px] tabular-nums">{amountText(c.amount)} {c.ticker}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DemoCards() {
  const demo = useDemo();
  const { byTicker } = useStockPrices();
  const cards = demo.cards.map((c) => {
    const price = byTicker[c.ticker]?.price;
    return { key: String(c.id), ticker: c.ticker, rarity: c.rarity, tier: c.tier, value: price ? c.amount * price : null, status: c.stakedAt != null ? ("Staked" as const) : undefined };
  });
  return <CardGrid cards={cards} />;
}

function LiveCards({ account }: { account: Address }) {
  const { cards, ready } = useStockCards(account);
  const { byTicker } = useStockPrices(60_000, "tokens");
  if (!ready) return <p className="text-sm text-muted" role="status">Loading cards…</p>;
  return (
    <CardGrid
      cards={cards.map((c) => {
        const price = byTicker[c.ticker]?.price;
        return { key: String(c.id), ticker: c.ticker, rarity: c.rarity, tier: c.tier, value: c.filled ? (price == null ? null : c.amount * price) : c.usd, status: statusOf(c) };
      })}
    />
  );
}

function CardGrid({ cards }: { cards: Owned[] }) {
  if (cards.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border-strong px-6 py-10 text-center text-sm text-muted">
        No cards yet. <Link href="/packs" className="text-black underline underline-offset-4">Open a pack</Link>
      </p>
    );
  }
  const extra = cards.length - SHOWN;
  return (
    <ul className="grid list-none grid-cols-3 gap-3 p-0 phone:grid-cols-4 desk:grid-cols-5">
      {cards.slice(0, SHOWN).map((c) => {
        const art = cardArt(c.ticker, c.rarity, c.tier);
        if (!art) return null;
        return (
          <li key={c.key} className="min-w-0">
            <Link href="/collection" className="block" aria-label={`${art.name}, ${RARITY_NAMES[c.rarity]}, ${c.ticker}${c.status ? `, ${c.status.toLowerCase()}` : ""}`}>
              <span className="card-status-frame">
                <StockCardFront art={art} rarity={c.rarity} decorative sizes="(max-width: 480px) 30vw, 140px" className="w-full" />
                {c.status && <span className="card-status-clip"><span className="card-status" data-status={c.status.toLowerCase()}>{c.status}</span></span>}
              </span>
              <span className="mt-1.5 flex items-baseline justify-between gap-1 text-sm">
                <span className="truncate text-muted">{RARITY_NAMES[c.rarity]}</span>
                <span className="tabular-nums">{c.value == null ? "—" : usd(c.value)}</span>
              </span>
            </Link>
          </li>
        );
      })}
      {extra > 0 && (
        <li className="grid place-items-center rounded-md border border-dashed border-border-strong">
          <Link href="/collection" className="p-3 text-center text-sm text-muted hover:text-black">+{extra} more</Link>
        </li>
      )}
    </ul>
  );
}
