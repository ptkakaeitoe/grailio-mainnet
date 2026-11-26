"use client";

import { cardArt } from "@/lib/cards";
import { tokenAmount } from "@/lib/format-amount";
import { StakingPoolPanel } from "@/components/staking-pool-panel";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useReadContracts, useWaitForTransactionReceipt } from "wagmi";
import { useToastedWrite } from "@/lib/toast";

import { collectCardsAbi, collectMarketAbi, collectMarketAddress, collectPacksAbi, collectPacksAddress, collectPacksTreasuryAbi, collectStakingAbi, collectStakingAddress, collectStakingLive, STAKE_WEIGHTS } from "@/lib/collect-packs";
import { PACK_TIERS, RARITY_NAMES, SNOWTRACE } from "@/lib/contracts";
import { TOKENS, PACK_DECIMALS } from "@/lib/tokens";
import { cleanButton, cn } from "@/components/clean-ui";
import { CollectionWelcome } from "@/components/collection-welcome";
import { ListingCard, listingButton, listingButtonOutline, listingGrid } from "@/components/market-parts";
import { RedeemDialog } from "@/components/redeem-dialog";
import { txErrorMessage } from "@/lib/tx-error";
import { useStockCards, type StockCardView } from "@/lib/use-stock-cards";
import { usd, useStockPrices } from "@/lib/use-stock-prices";

const fmt = (n: number, digits = 6) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 8 : digits });

/** Stat boxes match the market's Floor row. */
const statBox = "min-w-0 rounded-md border border-border px-4 py-4 desk:py-5";
const statValue = "mt-2 truncate text-[24px] leading-[1.2] tracking-tight tabular-nums phone:text-[28px]";

/**
 * The connected wallet's Grailio cards, shown like market listings: the card
 * with what it holds, its value now, and actions (stake, claim, redeem, fill),
 * plus a details dialog on click. Staked cards earn a share of Grailio's revenue.
 */
export function StockCardCollection() {
  const { cards, refetch, ready } = useStockCards();
  const { byTicker } = useStockPrices(60_000, "tokens");
  const [action, setAction] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState<StockCardView | null>(null);
  const { address } = useAccount();

  const stakedCards = cards.filter((card) => card.staked);
  const staking = { address: collectStakingAddress, abi: collectStakingAbi } as const;
  const stakeOn = collectStakingLive && Boolean(address);
  const stakeState = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: collectPacksAddress, abi: collectCardsAbi, functionName: "isApprovedForAll", args: [address!, collectStakingAddress] },
      { ...staking, functionName: "payoutPerDay" },
      { ...staking, functionName: "totalWeight" },
      { ...staking, functionName: "poolNow" },
      { address: collectPacksAddress, abi: collectPacksTreasuryAbi, functionName: "distributable" },
      { address: collectPacksAddress, abi: collectPacksTreasuryAbi, functionName: "stakingBps" },
    ],
    query: { enabled: stakeOn, refetchInterval: 15_000 },
  });
  const pendingReads = useReadContracts({
    allowFailure: true,
    contracts: stakedCards.map((card) => ({ ...staking, functionName: "pending" as const, args: [card.id] as const })),
    query: { enabled: stakeOn && stakedCards.length > 0, refetchInterval: 15_000 },
  });
  const [approval, payout, weight, poolRead, distributableRead, bpsRead] = stakeState.data ?? [];
  const approvedForStaking = approval?.status === "success" && approval.result === true;
  const pendingOf = new Map(stakedCards.map((card, i) => {
    const row = pendingReads.data?.[i];
    return [String(card.id), row?.status === "success" ? (row.result as bigint) : 0n] as const;
  }));
  const earned = [...pendingOf.values()].reduce((sum, v) => sum + v, 0n);
  const myWeight = stakedCards.reduce((sum, card) => sum + (STAKE_WEIGHTS[card.rarity] ?? 1), 0);
  const totalWeight = weight?.status === "success" ? (weight.result as bigint) : 0n;
  const payoutPerDay = payout?.status === "success" ? (payout.result as bigint) : 0n;
  const poolNow = poolRead?.status === "success" ? (poolRead.result as bigint) : 0n;
  // Stakers' share of revenue that Distribute would send to the pool now.
  const waitingRaw = distributableRead?.status === "success" && bpsRead?.status === "success"
    ? (distributableRead.result as bigint) * BigInt(bpsRead.result as number) / 10_000n
    : 0n;
  const money6 = (raw: bigint) => `$${Number(formatUnits(raw, PACK_DECIMALS)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;

  const { writeContract, data: hash, isPending, error, reset } = useToastedWrite();
  const receipt = useWaitForTransactionReceipt({ hash });
  const busy = isPending || receipt.isLoading;

  useEffect(() => {
    if (!receipt.isSuccess) return;
    void refetch();
    void stakeState.refetch();
    void pendingReads.refetch();
    // Only react to a newly confirmed transaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  function run(key: string, call: Parameters<typeof writeContract>[0]) {
    reset();
    setAction(key);
    writeContract(call);
  }

  /** Stake one card. The first time, this only allows the staking contract to hold your cards; then Stake. */
  function stake(id: bigint) {
    if (approvedForStaking) run(`stake-${id}`, { ...staking, functionName: "stake", args: [[id]] });
    else run(`stake-${id}`, { address: collectPacksAddress, abi: collectCardsAbi, functionName: "setApprovalForAll", args: [collectStakingAddress, true] });
  }

  /** What the card holds, at live DEX prices (unfilled cards hold USDT). */
  const valueOf = (card: StockCardView) => (card.filled ? (byTicker[card.ticker]?.price ?? 0) * card.amount : card.usd);
  const totalValue = cards.reduce((sum, card) => sum + valueOf(card), 0);
  const totalAtOpen = cards.reduce((sum, card) => sum + card.usd, 0);
  const listedCount = cards.filter((card) => card.listPrice !== null).length;

  if (ready && cards.length === 0) {
    return (
      <CollectionWelcome
        label="token-backed cards"
        title="Your first card awaits."
        body="Open a pack to start."
        action={<Link className={cleanButton.solid} href="/packs">Open a pack <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></Link>}
      />
    );
  }

  const change = totalAtOpen > 0 ? ((totalValue - totalAtOpen) / totalAtOpen) * 100 : 0;
  const stats = [
    { label: "Total cards", value: String(cards.length) },
    { label: "Staked", value: String(stakedCards.length), note: stakedCards.length ? "earning revenue" : undefined },
    { label: "Listed", value: String(listedCount), note: listedCount ? "on the marketplace" : undefined },
    { label: "Approx. value", value: `≈ ${usd(totalValue)}`, note: totalAtOpen > 0 ? `${change >= 0 ? "+" : ""}${change.toFixed(1)}% since opening` : undefined },
  ];

  return (
    // collection-body: /v2 hook.
    <section className="collection-body">
      <dl className="mb-8 grid grid-cols-2 gap-1.5 desk:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={statBox}>
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className={statValue}>{s.value}</dd>
            {s.note && <dd className="mt-1 text-sm text-muted">{s.note}</dd>}
          </div>
        ))}
      </dl>

      {stakeOn && (
        <StakingPoolPanel
          pool={Number(formatUnits(poolNow, PACK_DECIMALS))}
          waiting={Number(formatUnits(waitingRaw, PACK_DECIMALS))}
          perDay={Number(formatUnits(payoutPerDay, PACK_DECIMALS))}
          totalWeight={Number(totalWeight)}
          myWeight={myWeight}
          stakedCount={stakedCards.length}
          earned={money6(earned)}
          claim={{
            onClick: () => run("claim-all", { ...staking, functionName: "claim", args: [stakedCards.map((card) => card.id)] }),
            disabled: busy || earned === 0n,
            label: busy && action === "claim-all" ? "Claiming…" : "Claim",
          }}
        />
      )}

      {error && <p className="mb-4 text-sm break-words text-down" role="alert">{txErrorMessage(error)}</p>}

      <ul className={listingGrid}>
        {cards.map((card) => {
          const art = cardArt(card.ticker, card.rarity, card.tier);
          if (!art) return null;
          const key = String(card.id);
          const working = (name: string) => busy && action === `${name}-${key}`;
          const listing = card.listPrice !== null ? `${card.listCurrency === "BNB" ? `${fmt(card.listPrice, 4)} BNB` : usd(card.listPrice)}` : null;
          const status = card.staked ? "Staked" : listing ? `Listed · ${listing}` : card.filled ? "In wallet" : "In wallet · holding USDT";
          const cardEarned = pendingOf.get(key) ?? 0n;
          return (
            <ListingCard
              key={key}
              art={art}
              rarity={card.rarity}
              badge={RARITY_NAMES[card.rarity]}
              status={card.staked ? "staked" : listing ? "listed" : undefined}
              title={`card #${key}`}
              price={<span className="flex flex-col">
                <span>{usd(valueOf(card))}</span>
                {listing && <span className="truncate text-sm tracking-normal text-muted">Listed for {listing}</span>}
                {card.staked && <span className="truncate text-sm tracking-normal text-up">+{money6(cardEarned)} earned</span>}
              </span>}
              details={[
                { label: "Status", value: status },
                { label: "Inside", value: card.filled ? `${tokenAmount(card.amount)} ${TOKENS[card.ticker]?.symbol ?? card.ticker}` : `${usd(card.usd)} USDT (not filled yet)` },
                { label: "At opening", value: usd(card.usd) },
                { label: "Pack", value: PACK_TIERS[card.tier]?.name ?? "—" },
                ...(collectStakingLive ? [{ label: "Stake weight", value: `${STAKE_WEIGHTS[card.rarity] ?? 1}×` }] : []),
                ...(card.staked ? [{ label: "Earned", value: `${money6(cardEarned)} USDT` }] : []),
              ]}
              action={
                <span className="flex gap-2">
                  {card.staked ? (
                    <>
                      <button type="button" className={listingButton} disabled={busy || cardEarned === 0n} onClick={() => run(`claim-${key}`, { ...staking, functionName: "claim", args: [[card.id]] })}>
                        {working("claim") ? "Claiming…" : "Claim"}
                      </button>
                      <button type="button" className={listingButtonOutline} disabled={busy} onClick={() => run(`unstake-${key}`, { ...staking, functionName: "unstake", args: [[card.id]] })}>
                        {working("unstake") ? "Unstaking…" : "Unstake"}
                      </button>
                    </>
                  ) : listing ? (
                    <>
                      <button type="button" className={listingButtonOutline} disabled={busy} onClick={() => run(`cancel-${key}`, { address: collectMarketAddress, abi: collectMarketAbi, functionName: "cancel", args: [collectPacksAddress, card.id] })}>
                        {working("cancel") ? "Unlisting…" : "Unlist"}
                      </button>
                      <Link href="/marketplace" className={cn(listingButtonOutline, "inline-flex items-center justify-center gap-1")}>Market <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></Link>
                    </>
                  ) : (
                    <>
                      {card.filled && collectStakingLive ? (
                        <button type="button" className={listingButton} disabled={busy} onClick={() => stake(card.id)}>
                          {working("stake") ? (approvedForStaking ? "Staking…" : "Allowing…") : approvedForStaking ? "Stake" : "Allow staking"}
                        </button>
                      ) : card.filled ? (
                        <Link href="/marketplace" className={cn(listingButton, "inline-flex items-center justify-center gap-1")}>Sell <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></Link>
                      ) : (
                        <button type="button" className={listingButton} disabled={busy} onClick={() => run(`fill-${key}`, { address: collectPacksAddress, abi: collectPacksAbi, functionName: "fill", args: [card.id] })}>
                          {working("fill") ? "Filling…" : `Fill with ${card.ticker}`}
                        </button>
                      )}
                      {/* aria-haspopup lets the details dialog close before the redeem dialog opens. */}
                      <button type="button" aria-haspopup="dialog" className={listingButtonOutline} disabled={busy} onClick={() => setRedeeming(card)}>
                        Redeem
                      </button>
                    </>
                  )}
                </span>
              }
              link={<span className="flex flex-wrap gap-x-4 gap-y-1">
                {collectStakingLive && card.filled && !card.staked && !listing && <Link className="inline-flex items-center gap-1 hover:text-black" href="/marketplace">Sell on the marketplace <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></Link>}
                <a className="inline-flex items-center gap-1 hover:text-black" href={`${SNOWTRACE}/nft/${collectPacksAddress}/${key}`} target="_blank" rel="noreferrer">View on BscScan <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></a>
              </span>}
            />
          );
        })}
      </ul>

      {redeeming && (
        <RedeemDialog card={redeeming} value={valueOf(redeeming)} onClose={() => setRedeeming(null)} onRedeemed={() => void refetch()} />
      )}
    </section>
  );
}
