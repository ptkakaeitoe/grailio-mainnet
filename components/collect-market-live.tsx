"use client";

import { STOCK_CARDS, cardArt } from "@/lib/cards";
import { StockCardFront } from "@/components/stock-card-front";
import { CardPickerDialog } from "@/components/card-picker-dialog";
import { tokenAmount } from "@/lib/format-amount";
import { ArrowUpRightIcon, CheckIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { useToastedWrite } from "@/lib/toast";

import { useConnectWallet } from "@/components/beta-access";
import { BuyConfirmDialog } from "@/components/buy-confirm-dialog";
import { cleanButton, cleanField, cn } from "@/components/clean-ui";
import {
  MarketState,
  SELL_HREF,
  stateAction,
  MarketLayout,
  type MarketMode,
  SellButton,
  ListingCard,
  listingButton,
  listingButtonOutline,
  ListingsHeader,
  listingGrid,
  sectionLabel,
  sectionTitle,
  useAssetFilter,
} from "@/components/market-parts";
import { isStock } from "@/lib/stock-assets";
import { SellWorkspace } from "@/components/sell-workspace";
import { TokenIcon } from "@/components/token-icon";
import { appChain, explorerUrl } from "@/lib/chain";
import { collectMarketAbi, collectMarketAddress, collectPacksAddress } from "@/lib/collect-packs";
import { erc20Abi, PACK_TIERS, RARITY_NAMES } from "@/lib/contracts";
import { TOKENS, PACK_DECIMALS, PACK_TOKEN } from "@/lib/tokens";
import { useApproval, useNftApproval } from "@/lib/use-approval";
import { priceAmount, useCollectListings, useMyCollectCards, type CardInfo, type CollectListing } from "@/lib/use-collect-market";
import { useNowSeconds } from "@/lib/use-now";
import { usd, useStockPrices } from "@/lib/use-stock-prices";
import { txErrorMessage } from "@/lib/tx-error";

type Currency = "BNB" | "USDT";
const money = (raw: bigint) => usd(Number(formatUnits(raw, PACK_DECIMALS)));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const amountText = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 8 : 4 });
const DURATIONS = [
  { label: "1 day", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

function timeLeft(expiresAt: number, now: number) {
  const s = expiresAt - now;
  if (s <= 0) return "expired";
  if (s < 3600) return `${Math.ceil(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/** A listing's price in its own currency, e.g. "0.75 BNB" or "$5.00". */
const priceText = (l: Pick<CollectListing, "price" | "inAvax">) => (l.inAvax ? `${amountText(priceAmount(l))} BNB` : money(l.price));

export function CollectMarketLive({ mode = "both" }: { mode?: MarketMode }) {
  const { address, chain } = useAccount();
  const { openConnect } = useConnectWallet();
  const onChain = chain?.id === appChain.id;
  const now = useNowSeconds();
  const { listings, loading, error: loadError, refetch } = useCollectListings();
  const mine = useMyCollectCards();
  const { byTicker } = useStockPrices(60_000, "tokens");
  const avaxUsd = byTicker.WBNB?.price ?? null;

  /** What a card holds, at live DEX prices. */
  const worth = (card: CardInfo) => {
    if (!card.filled) return Number(formatUnits(card.usd, PACK_DECIMALS));
    const price = byTicker[card.ticker]?.price;
    return price ? card.amount * price : null;
  };
  /** A listing's price in USD, so BNB and USDT listings compare. */
  const usdOf = (l: CollectListing) => (l.inAvax ? (avaxUsd ? priceAmount(l) * avaxUsd : null) : priceAmount(l));

  const [rarity, setRarity] = useState("all");
  const [sort, setSort] = useState<"price" | "recent">("price");
  const inRarity = (l: CollectListing) => rarity === "all" || RARITY_NAMES[l.rarity] === rarity;
  // One chip per stock.
  const assets = useAssetFilter({ cards: STOCK_CARDS, keep: (c) => isStock(c.ticker), listings, tickerOf: (l) => l.ticker, usdOf, inView: inRarity });
  const usdValue = (l: CollectListing) => (l.inAvax ? priceAmount(l) * (avaxUsd ?? 0) : priceAmount(l));
  const shown = listings
    .filter((l) => inRarity(l) && assets.matches(l))
    .sort((a, b) => (sort === "price" ? usdValue(a) - usdValue(b) : Number(b.id - a.id)));

  // One USDT approval covers every USDT listing up to the dearest one. BNB needs none.
  const maxUsdcPrice = listings.reduce((m, l) => (!l.inAvax && l.price > m ? l.price : m), 0n);
  const usdcApproval = useApproval(address ? PACK_TOKEN.address : null, collectMarketAddress, maxUsdcPrice);
  const nftApproval = useNftApproval(collectPacksAddress, collectMarketAddress);
  const { data: feeBps } = useReadContract({ address: collectMarketAddress, abi: collectMarketAbi, functionName: "feeBps" });
  const fee = Number(feeBps ?? 100n) / 10_000;

  const { writeContract, data: hash, isPending, error: txError, reset } = useToastedWrite();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [action, setAction] = useState<string | null>(null);
  const busy = isPending || receipt.isLoading;
  // The listing being confirmed before it's bought.
  const [confirming, setConfirming] = useState<CollectListing | null>(null);
  const avaxBalance = useBalance({ address, query: { enabled: Boolean(address && confirming) } });
  const usdcBalance = useReadContract({ address: PACK_TOKEN.address, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: Boolean(address && confirming) } });
  useEffect(() => {
    if (!receipt.isSuccess) return;
    refetch();
    mine.refetch();
    // Only react to a newly confirmed transaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  // Sound and a visible step when an approval or a listing confirms.
  const listedId = receipt.isSuccess && action?.startsWith("list-") ? action.slice(5) : null;
  // Listed / cancelled notes clear after a few seconds (the toast already confirmed it).
  useEffect(() => {
    if (!receipt.isSuccess || !(action?.startsWith("list-") || action?.startsWith("cancel-"))) return;
    const t = setTimeout(() => { reset(); setAction(null); }, 5_000);
    return () => clearTimeout(t);
    // Only when a listing or cancel confirms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess, action]);
  // (Sounds come with the transaction toasts, lib/toast.ts.)

  function run(key: string, call: Parameters<typeof writeContract>[0]) {
    reset();
    setAction(key);
    writeContract(call);
  }

  function buy(l: CollectListing) {
    const key = l.id.toString();
    if (l.inAvax) {
      // BNB listings: pay the exact price as the transaction value, no approval.
      reset();
      setAction(key);
      writeContract({ address: collectMarketAddress, abi: collectMarketAbi, functionName: "buy", args: [collectPacksAddress, l.id, true, l.price], value: l.price });
    } else {
      run(key, { address: collectMarketAddress, abi: collectMarketAbi, functionName: "buy", args: [collectPacksAddress, l.id, false, l.price] });
    }
  }

  // ---- sell panel ----
  const myListings = new Map(listings.filter((l) => address && l.seller.toLowerCase() === address.toLowerCase()).map((l) => [l.id.toString(), l]));
  const listedIds = new Set(myListings.keys());
  const listingEnds = (l: CollectListing) => {
    const left = l.expiresAt - now;
    return left <= 0 ? "Ended" : left < 86_400 ? `in ${Math.max(1, Math.round(left / 3_600))}h` : `in ${Math.round(left / 86_400)}d`;
  };
  const sellable = mine.cards.filter((c) => !c.staked && !listedIds.has(c.id.toString()));
  const [sellId, setSellId] = useState("");
  // The sell page starts with nothing picked; the side form picks your first card.
  const selected = sellable.find((c) => c.id.toString() === sellId) ?? (mode === "sell" ? undefined : sellable[0]);
  const [picking, setPicking] = useState(false);
  const [currency, setCurrency] = useState<Currency>("USDT");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState(7);
  let priceRaw = 0n;
  try {
    priceRaw = price.trim() ? parseUnits(price.trim(), currency === "BNB" ? 18 : PACK_DECIMALS) : 0n;
  } catch {
    priceRaw = 0n;
  }
  const selectedWorth = selected ? worth(selected) : null;
  // Suggested price: what the card holds, in the chosen currency.
  const suggestion = selectedWorth === null ? null : currency === "USDT" ? selectedWorth.toFixed(2) : avaxUsd ? (selectedWorth / avaxUsd).toFixed(4) : null;
  const payoutRaw = priceRaw - (priceRaw * BigInt(Math.round(fee * 10_000))) / 10_000n;
  const payoutText = currency === "BNB" ? `${amountText(Number(formatUnits(payoutRaw, 18)))} BNB` : money(payoutRaw);

  const SellTitle = mode === "sell" ? "h1" : "h2";

  function submitListing() {
    if (!selected || priceRaw <= 0n) return;
    if (!nftApproval.approved) { nftApproval.approve(); return; }
    const expiresAt = BigInt(now + days * 86_400);
    run(`list-${selected.id}`, { address: collectMarketAddress, abi: collectMarketAbi, functionName: "list", args: [collectPacksAddress, selected.id, priceRaw, currency === "BNB", expiresAt] });
  }

  const sellPage = (
    <SellWorkspace
      fee={fee}
      cards={address ? mine.cards.map((c) => ({
        id: c.id.toString(),
        art: cardArt(c.ticker, c.rarity, c.tier),
        rarity: c.rarity,
        inside: c.filled ? `${tokenAmount(c.amount)} ${TOKENS[c.ticker]?.symbol ?? c.ticker}` : `${money(c.usd)} USDT (unfilled)`,
        worth: worth(c),
        blocked: c.staked ? "Staked" : listedIds.has(c.id.toString()) ? "Listed" : null,
        listing: !c.staked && myListings.has(c.id.toString()) ? { price: priceText(myListings.get(c.id.toString())!), ends: listingEnds(myListings.get(c.id.toString())!) } : null,
      })) : []}
      loading={Boolean(address) && mine.loading}
      empty={address
        ? { title: "Your first card awaits.", welcome: "Open a pack to start.", action: <Link href="/packs" className={cleanButton.solid}>Open a pack <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></Link> }
        : { title: "Connect to see your cards.", action: <button type="button" className={cn(cleanButton.solid, "justify-between")} onClick={openConnect}>Connect wallet <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></button> }}
      selectedId={listedIds.has(sellId) ? sellId : selected?.id.toString() ?? null}
      onSelect={(id) => { setSellId(id); if (!busy) { reset(); setAction(null); } }}
      onCancel={(id) => run(`cancel-${id}`, { address: collectMarketAddress, abi: collectMarketAbi, functionName: "cancel", args: [collectPacksAddress, BigInt(id)] })}
      cancelBusy={busy && Boolean(action?.startsWith("cancel-"))}
      currency={currency}
      onCurrency={setCurrency}
      price={price}
      onPrice={setPrice}
      avaxUsd={avaxUsd}
      days={days}
      onDays={setDays}
      status={<>
        {nftApproval.justApproved && !listedId && (
          <p className="flex items-center gap-1.5 text-sm text-up" role="status"><CheckIcon className="size-4" /> Cards approved. Now list your card.</p>
        )}
        {receipt.isSuccess && action?.startsWith("cancel-") && (
          <p className="flex items-center gap-1.5 text-sm text-up" role="status"><CheckIcon className="size-4" /> Listing cancelled. Card #{action.slice(7)} can be listed again.</p>
        )}
        {listedId && (
          <p className="flex items-center gap-1.5 text-sm text-up" role="status"><CheckIcon className="size-4" /> Listed card #{listedId}. <Link href="/marketplace" className="underline underline-offset-4">See it on the market</Link></p>
        )}
      </>}
      submitLabel={nftApproval.approving ? "Approving…" : !nftApproval.approved ? "Approve cards for sale" : busy && action?.startsWith("list") ? "Listing…" : "List card"}
      submitDisabled={!address || !onChain || busy || nftApproval.approving || !nftApproval.known}
      onSubmit={submitListing}
      note="The card stays in your wallet until it sells. Moving or redeeming it cancels the listing."
    />
  );
  return (
    <MarketLayout
      mode={mode}
      listings={<>
          <ListingsHeader
            count={shown.length}
            filters={[{ label: "All", value: "all" }, ...RARITY_NAMES.map((r) => ({ label: r, value: r }))]}
            value={rarity}
            onFilter={(v) => setRarity(String(v))}
            sort={sort}
            onSort={(v) => setSort(v as "price" | "recent")}
            sortOptions={[{ value: "price", label: "Price: low to high" }, { value: "recent", label: "Newest cards" }]}
            stock={assets}
            action={mode === "browse" ? <SellButton /> : undefined}
          />

          {loading ? (
            <MarketState kind="loading" title="Loading listings…" />
          ) : loadError ? (
            <MarketState kind="error" title="Couldn’t load listings." action={<button type="button" className={stateAction} onClick={refetch}>Retry</button>} />
          ) : shown.length === 0 ? (
            listings.length ? (
              <MarketState title="Nothing listed here." action={<button type="button" className={stateAction} onClick={() => { setRarity("all"); assets.clear(); }}>Show all</button>} />
            ) : (
              <MarketState title="No listings yet." action={<Link href={SELL_HREF} className={stateAction}>Sell a card<ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></Link>} />
            )
          ) : (
            <ul className={listingGrid}>
              {shown.map((l) => {
                const key = l.id.toString();
                const own = Boolean(address && l.seller.toLowerCase() === address.toLowerCase());
                const value = worth(l);
                const priceUsd = usdOf(l);
                const label = action === key && busy ? (isPending ? "Confirm…" : "Working…") : null;
                return (
                  <ListingCard
                    key={key}
                    art={cardArt(l.ticker, l.rarity, l.tier)}
                    rarity={l.rarity}
                    badge={RARITY_NAMES[l.rarity]}
                    title={`card #${key}`}
                    price={
                      <span className="inline-flex items-center gap-1.5">
                        <TokenIcon symbol={l.inAvax ? "BNB" : "USDT"} className="size-4" title={l.inAvax ? "Priced in BNB" : "Priced in USDT"} />
                        {priceText(l)}
                        {l.inAvax && priceUsd !== null && <span className="text-sm text-muted">≈ {usd(priceUsd)}</span>}
                      </span>
                    }
                    details={[
                      { label: "Inside", value: l.filled ? `${tokenAmount(l.amount)} ${TOKENS[l.ticker].symbol}` : `${money(l.usd)} USDT (unfilled)` },
                      { label: "Worth now", value: value === null ? "—" : usd(value) },
                      { label: "Paid in", value: l.inAvax ? "BNB" : "USDT" },
                      { label: "Pack", value: PACK_TIERS[l.tier]?.name ?? "—" },
                      { label: "Seller", value: own ? "You" : short(l.seller) },
                      { label: "Ends in", value: timeLeft(l.expiresAt, now) },
                    ]}
                    link={<a className="inline-flex items-center gap-1 hover:text-black" href={`${explorerUrl}/nft/${collectPacksAddress}/${key}`} target="_blank" rel="noreferrer">View on BscScan <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></a>}
                    action={
                      !address ? (
                        <button type="button" className={listingButton} onClick={openConnect}>Connect to buy</button>
                      ) : own ? (
                        <button type="button" className={listingButtonOutline} disabled={busy || !onChain} onClick={() => run(key, { address: collectMarketAddress, abi: collectMarketAbi, functionName: "cancel", args: [collectPacksAddress, l.id] })}>
                          {label ?? "Cancel listing"}
                        </button>
                      ) : !l.inAvax && usdcApproval.needsApproval ? (
                        <button type="button" className={listingButton} disabled={usdcApproval.approving || !onChain} onClick={usdcApproval.approve}>
                          {usdcApproval.approving ? "Approving…" : "Approve USDT"}
                        </button>
                      ) : (
                        <button type="button" aria-haspopup="dialog" className={listingButton} disabled={busy || !onChain} onClick={() => { reset(); setConfirming(l); }}>
                          {label ?? `Buy ${priceText(l)}`}
                        </button>
                      )
                    }
                  />
                );
              })}
            </ul>
          )}
      </>}
      sell={mode === "sell" ? sellPage : <>
            <div className="mb-6 flex items-baseline justify-between gap-3">
              <SellTitle className={sectionTitle}>Sell</SellTitle>
              <span className={sectionLabel}>[ fee {fee * 100}% ]</span>
            </div>
            {!address ? (
              <button type="button" className={cn(cleanButton.solid, "w-full justify-between")} onClick={openConnect}>
                Connect wallet <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" />
              </button>
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => { event.preventDefault(); submitListing(); }}
              >
                <div className="flex flex-col gap-1.5 text-sm text-muted">
                  <span id="sell-card-label">Card</span>
                  {/* Opens a picker showing every card you own. */}
                  <button
                    type="button"
                    aria-labelledby="sell-card-label"
                    aria-haspopup="dialog"
                    className={cn(cleanField, "flex items-center gap-3 text-left text-base text-foreground disabled:text-muted")}
                    disabled={mine.loading && mine.cards.length === 0}
                    onClick={() => setPicking(true)}
                  >
                    {selected ? (
                      <>
                        <StockCardFront art={cardArt(selected.ticker, selected.rarity, selected.tier)} rarity={selected.rarity} decorative sizes="28px" className="w-7 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">#{selected.id.toString()} · {cardArt(selected.ticker, selected.rarity, selected.tier).name} · {RARITY_NAMES[selected.rarity]}</span>
                      </>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-muted">{mine.loading ? "Loading your cards…" : sellable.length === 0 ? "No cards to sell" : "Choose a card"}</span>
                    )}
                    <span className="shrink-0 text-sm text-muted">{mine.cards.length > 0 ? "Change" : ""}</span>
                  </button>
                  {mine.cards.length > 0 && sellable.length === 0 && (
                    <span className="text-[13px]">Your cards are staked or already listed.</span>
                  )}
                </div>
                {selected && (
                  <p className="text-sm text-muted">
                    {/* e.g. "Contains $0.94 ETH": what the card holds, in dollars. */}
                    Contains {!selected.filled ? `${money(selected.usd)} USDT` : selectedWorth !== null ? `$${selectedWorth.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${selected.ticker}` : `${amountText(selected.amount)} ${TOKENS[selected.ticker].symbol}`}
                  </p>
                )}
                <div className="flex flex-col gap-1.5 text-sm text-muted">
                  <span>Get paid in</span>
                  <div className="flex gap-1.5" role="group" aria-label="Listing currency">
                    {(["USDT", "BNB"] as const).map((c) => (
                      <button key={c} type="button" aria-pressed={currency === c} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border px-2 py-2 text-sm text-black transition-colors hover:border-black aria-pressed:border-black" onClick={() => { setCurrency(c); setPrice(""); }}>
                        <TokenIcon symbol={c} className="size-4" /> {c}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5 text-sm text-muted">
                  <span>Price ({currency})</span>
                  <input className={cleanField} inputMode="decimal" placeholder={suggestion ?? "0.00"} value={price} onChange={(e) => setPrice(e.target.value)} />
                </label>
                <div className="flex gap-1.5" role="group" aria-label="Listing length">
                  {DURATIONS.map((d) => (
                    <button key={d.days} type="button" aria-pressed={days === d.days} className="flex-1 rounded-md border border-border px-2 py-2 text-sm transition-colors hover:border-black aria-pressed:border-black" onClick={() => setDays(d.days)}>
                      {d.label}
                    </button>
                  ))}
                </div>
                {priceRaw > 0n && <p className="text-sm text-muted">You get {payoutText} when it sells.</p>}
                {nftApproval.justApproved && !listedId && (
                  <p className="flex items-center gap-1.5 text-sm text-up" role="status"><CheckIcon className="size-4" /> Cards approved. Now list your card.</p>
                )}
                {listedId && (
                  <p className="flex items-center gap-1.5 text-sm text-up" role="status"><CheckIcon className="size-4" /> Listed card #{listedId}. It&apos;s on the market now.</p>
                )}
                <button
                  type="submit"
                  className={cn(cleanButton.solid, "mt-1 w-full justify-between")}
                  disabled={!onChain || !selected || priceRaw <= 0n || busy || nftApproval.approving || !nftApproval.known}
                >
                  {nftApproval.approving ? "Approving…" : !nftApproval.approved ? "Approve cards for sale" : busy && action?.startsWith("list") ? "Listing…" : "List card"} <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" />
                </button>
                <p className="text-[13px] text-muted">The card stays in your wallet until it sells. Moving or redeeming it cancels the listing.</p>
              </form>
            )}
      </>}
      extra={<>

      {(txError || usdcApproval.error || nftApproval.error) && (
        <p className="mt-6 text-sm break-words text-down" role="alert">{txErrorMessage((txError ?? usdcApproval.error ?? nftApproval.error)!)}</p>
      )}
      {address && !onChain && <p className="mt-6 text-sm text-down" role="alert">Switch your wallet to BNB Smart Chain.</p>}

      {picking && (
        <CardPickerDialog
          cards={mine.cards}
          listedIds={listedIds}
          selectedId={selected?.id.toString() ?? null}
          worth={worth}
          onSelect={(id) => { setSellId(id); if (!busy) { reset(); setAction(null); } }}
          onClose={() => setPicking(false)}
        />
      )}
      {/* Hidden once this purchase confirms; the next Buy click resets the transaction. */}
      {confirming && !(receipt.isSuccess && action === confirming.id.toString()) && (() => {
        const l = confirming;
        const art = cardArt(l.ticker, l.rarity, l.tier);
        // Your balance of the listing's currency, in whole units.
        const have = l.inAvax ? (avaxBalance.data ? Number(formatUnits(avaxBalance.data.value, 18)) : null) : usdcBalance.data !== undefined ? Number(formatUnits(usdcBalance.data as bigint, PACK_DECIMALS)) : null;
        const cost = priceAmount(l);
        const money = (n: number) => (l.inAvax ? `${amountText(n)} BNB` : usd(n));
        const value = worth(l);
        const priceUsd = usdOf(l);
        const key = l.id.toString();
        const working = action === key && busy;
        return art ? (
          <BuyConfirmDialog
            art={art}
            rarity={l.rarity}
            inside={l.filled ? `${tokenAmount(l.amount)} ${TOKENS[l.ticker].symbol}` : `${money(Number(formatUnits(l.usd, PACK_DECIMALS)))} USDT`}
            worth={value === null ? "—" : usd(value)}
            price={priceText(l)}
            priceUsd={l.inAvax && priceUsd !== null ? `≈ ${usd(priceUsd)}` : undefined}
            balance={have === null ? null : money(have)}
            after={have === null ? null : money(have - cost)}
            seller={short(l.seller)}
            insufficient={have !== null && have < cost}
            busy={working ? (isPending ? "Confirm in your wallet…" : "Buying…") : null}
            error={action === key && txError ? txErrorMessage(txError) : null}
            onConfirm={() => buy(l)}
            onClose={() => setConfirming(null)}
          />
        ) : null;
      })()}
      </>}
    />
  );
}
