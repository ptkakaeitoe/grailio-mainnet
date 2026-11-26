"use client";

import { cardArt } from "@/lib/cards";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { cleanButton } from "@/components/clean-ui";
import { CollectionWelcome } from "@/components/collection-welcome";
import { useEffect, useState } from "react";
import { RedeemDialog } from "@/components/redeem-dialog";
import { useDemo } from "@/components/demo-provider";
import {
  ListingCard,
  listingButton,
  listingButtonOutline,
  listingGrid,
} from "@/components/market-parts";
// Demo mode uses the stock set.
import { PACK_TIERS, RARITY_NAMES } from "@/lib/contracts";
import { DEMO_OTHER_WEIGHT, DEMO_STAKE_WEIGHTS, type DemoCard } from "@/lib/demo-economy";
import { StakingPoolPanel } from "@/components/staking-pool-panel";
import { useStockPrices } from "@/lib/use-stock-prices";

const dollars = (n: number | null) =>
  n === null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Staking rewards: enough decimals to see them grow second by second. */
const reward = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
const amountText = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

/** Demo-mode cards, laid out like the live collection with simulated actions. */
export function DemoCollection() {
  const demo = useDemo();
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [redeeming, setRedeeming] = useState<DemoCard | null>(null);
  const { byTicker } = useStockPrices();
  /** What a card holds, at live stock prices. */
  const worth = (card: DemoCard) => {
    const price = byTicker[card.ticker]?.price;
    return price ? card.amount * price : null;
  };
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  function act(id: number, action: "stake" | "unstake" | "claim" | "redeem") {
    const ok = demo.cardAction(id, action);
    setNotice(ok ? `Demo ${action} complete.` : "Unstake before redeeming.");
  }

  const redeemDialog = redeeming && (
    <RedeemDialog
      card={{
        id: BigInt(redeeming.id),
        ticker: redeeming.ticker,
        amount: redeeming.amount,
        rarity: redeeming.rarity,
        tier: redeeming.tier,
        filled: true,
        usd: 0,
        staked: false,
        since: null,
        listPrice: null,
        listCurrency: null,
      }}
      value={redeeming.amount * (byTicker[redeeming.ticker]?.price ?? 0)}
      onClose={() => setRedeeming(null)}
      onRedeemed={() =>
        setNotice(
          `Redeemed: ${redeeming.amount.toFixed(6)} ${redeeming.ticker} added to your holdings.`,
        )
      }
      demoRedeem={() => demo.cardAction(redeeming.id, "redeem")}
    />
  );

  // The redeem dialog stays mounted after the last card goes, so its result still shows.
  if (demo.cards.length === 0) {
    return (
      <>
        <CollectionWelcome
          label="demo"
          title={notice ? "No cards left." : "Your first card awaits."}
          body={notice || "Open a demo pack to start."}
          action={
            <Link href="/packs" className={cleanButton.solid}>
              Open a pack <ArrowUpRightIcon weight="bold" />
            </Link>
          }
        />
        {redeemDialog}
      </>
    );
  }

  // Staking: a revenue pool paid out every second with a 7-day half-life, split by weight.
  const stakedCards = demo.cards.filter((c) => c.stakedAt !== null);
  const pool = demo.stakingNow(now);
  const myWeight = stakedCards.reduce((w, c) => w + DEMO_STAKE_WEIGHTS[c.rarity], 0);
  const earned = stakedCards.reduce((sum, c) => sum + demo.pending(c, now), 0);
  function claimAll() {
    stakedCards.forEach((c) => demo.cardAction(c.id, "claim"));
    setNotice(`Claimed ${reward(earned)} USDC from staking.`);
  }

  return (
    <>
      <section aria-label="Demo collection">
        <StakingPoolPanel
          pool={pool.pool}
          perDay={pool.total}
          totalWeight={DEMO_OTHER_WEIGHT + myWeight}
          myWeight={myWeight}
          stakedCount={stakedCards.length}
          earned={`$${reward(earned)}`}
          claim={{ onClick: claimAll, disabled: earned <= 0, label: "Claim" }}
        />
        {notice && <p className="mb-6 text-sm text-muted" role="status">{notice}</p>}
        <ul className={listingGrid}>
          {demo.cards.map((card) => {
            const art = cardArt(card.ticker, card.rarity, card.tier);
            if (!art) return null;
            const staked = card.stakedAt !== null;
            return (
              <ListingCard
                key={card.id}
                art={art}
                rarity={card.rarity}
                badge={RARITY_NAMES[card.rarity]}
                status={staked ? "staked" : undefined}
                title={`demo card #${card.id}`}
                showName={false}
                price={
                  <span className="flex flex-col">
                    <span>{dollars(worth(card))}</span>
                    <span className="text-sm tracking-normal text-muted">
                      {amountText(card.amount)} {card.ticker}
                    </span>
                    {staked && (
                      <span className="truncate text-sm tracking-normal text-up">
                        +{reward(demo.pending(card, now))} earned
                      </span>
                    )}
                  </span>
                }
                details={[
                  { label: "Worth now", value: dollars(worth(card)) },
                  { label: "Status", value: staked ? "Staked" : "In wallet" },
                  {
                    label: "Stake weight",
                    value: `${DEMO_STAKE_WEIGHTS[card.rarity]}× · ${(pool.perWeight * DEMO_STAKE_WEIGHTS[card.rarity]).toFixed(2)} USDC/day`,
                  },
                  ...(staked
                    ? [
                        {
                          label: "Pending",
                          value: `${demo.pending(card, now).toFixed(6)} USDC`,
                        },
                      ]
                    : []),
                  { label: "Pack", value: PACK_TIERS[card.tier].name },
                ]}
                action={
                  <span className="flex gap-2">
                    {staked ? (
                      <>
                        <button
                          type="button"
                          className={listingButton}
                          onClick={() => act(card.id, "claim")}
                        >
                          Claim
                        </button>
                        <button
                          type="button"
                          className={listingButtonOutline}
                          onClick={() => act(card.id, "unstake")}
                        >
                          Unstake
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={listingButton}
                          onClick={() => act(card.id, "stake")}
                        >
                          Stake
                        </button>
                        <button
                          type="button"
                          className={listingButtonOutline}
                          onClick={() => setRedeeming(card)}
                        >
                          Redeem
                        </button>
                      </>
                    )}
                  </span>
                }
              />
            );
          })}
        </ul>
      </section>
      {redeemDialog}
    </>
  );
}
