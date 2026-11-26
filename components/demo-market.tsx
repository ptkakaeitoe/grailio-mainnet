"use client";

import { DEMO_STOCK_CARDS, cardArt } from "@/lib/cards";
import { showToast } from "@/lib/toast";
import { CardPickerDialog } from "@/components/card-picker-dialog";
import { StockCardFront } from "@/components/stock-card-front";
import type { CardInfo } from "@/lib/use-collect-market";
import { tokenAmount } from "@/lib/format-amount";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cleanButton, cleanField, cn } from "@/components/clean-ui";
import { BuyConfirmDialog } from "@/components/buy-confirm-dialog";
import { useDemo } from "@/components/demo-provider";
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
import { SellWorkspace } from "@/components/sell-workspace";
import { TokenIcon } from "@/components/token-icon";
import { PACK_TIERS, RARITY_NAMES } from "@/lib/contracts";
import { DEMO_MARKET_FEE, type DemoCard, type DemoCurrency, type DemoListing } from "@/lib/demo-economy";
import { usd, useStockPrices } from "@/lib/use-stock-prices";

const amountText = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 4 });
/** BNB to 4 decimals; dollars to cents. */
const avaxText = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 4 })} BNB`;
const dollars = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const priceText = (l: Pick<DemoListing, "price" | "currency">) => (l.currency === "BNB" ? avaxText(l.price) : dollars(l.price));
const DURATIONS = [
  { label: "1 day", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

/** The marketplace in demo mode: simulated collectors, your demo cards and balances. */
export function DemoMarket({ mode = "both" }: { mode?: MarketMode }) {
  const demo = useDemo();
  const { market } = demo;
  const { byTicker } = useStockPrices();
  const avaxUsd = byTicker.WBNB?.price ?? null;
  const prices = Object.fromEntries(DEMO_STOCK_CARDS.map((c) => [c.ticker, byTicker[c.ticker]?.price ?? 0]));
  const pricesReady = avaxUsd !== null && Object.values(prices).every((p) => p > 0);
  const [notice, setNotice] = useState("");
  // The listing being confirmed before it's bought.
  const [confirming, setConfirming] = useState<DemoListing | null>(null);

  // Other collectors' listings appear once prices are known (seeding runs once per demo session).
  useEffect(() => {
    if (pricesReady) market.seed(prices, avaxUsd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricesReady]);

  const worth = (card: DemoCard) => (prices[card.ticker] ? card.amount * prices[card.ticker] : null);
  const usdOf = (l: DemoListing) => (l.currency === "BNB" ? (avaxUsd ? l.price * avaxUsd : null) : l.price);

  const [rarity, setRarity] = useState("all");
  const [sort, setSort] = useState<"price" | "recent">("price");
  const inRarity = (l: DemoListing) => rarity === "all" || RARITY_NAMES[l.card.rarity] === rarity;
  const assets = useAssetFilter({ cards: DEMO_STOCK_CARDS, keep: () => true, listings: market.listings, tickerOf: (l) => l.card.ticker, usdOf, inView: inRarity });
  const value = (l: DemoListing) => (l.currency === "BNB" ? l.price * (avaxUsd ?? 0) : l.price);
  const shown = market.listings
    .filter((l) => inRarity(l) && assets.matches(l))
    .sort((a, b) => (sort === "price" ? value(a) - value(b) : b.id - a.id));

  function buy(l: DemoListing) {
    const ok = market.buy(l.id);
    setNotice(ok ? `Bought ${cardArt(l.card.ticker, l.card.rarity, l.card.tier).name} for ${priceText(l)}. It’s in your profile.` : `Not enough ${l.currency} in your demo wallet.`);
    if (ok) showToast({ kind: "success", title: `Card #${l.card.id} is yours`, detail: "Demo purchase" });
  }

  // ---- sell panel ----
  const sellable = demo.cards.filter((c) => c.stakedAt === null);
  const [sellId, setSellId] = useState("");
  // The sell page starts with nothing picked; the side form picks your first card.
  const selected = sellable.find((c) => String(c.id) === sellId) ?? (mode === "sell" ? undefined : sellable[0]);
  const [picking, setPicking] = useState(false);
  /** Demo cards in the picker's shape (demo cards are always filled). */
  const pickerCards = demo.cards.map((c): CardInfo => ({ id: BigInt(c.id), ticker: c.ticker, tier: c.tier, rarity: c.rarity, filled: true, usd: 0n, amount: c.amount, staked: c.stakedAt !== null }));
  const [currency, setCurrency] = useState<DemoCurrency>("USDT");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState(7);
  const amount = Number(price);
  const valid = price.trim() !== "" && Number.isFinite(amount) && amount > 0;
  const selectedWorth = selected ? worth(selected) : null;
  const suggestion = selectedWorth === null ? null : currency === "USDT" ? selectedWorth.toFixed(2) : avaxUsd ? (selectedWorth / avaxUsd).toFixed(4) : null;
  const payout = valid ? amount * (1 - DEMO_MARKET_FEE) : 0;

  const SellTitle = mode === "sell" ? "h1" : "h2";

  function submitListing() {
    if (!selected || !valid) return;
    if (market.list(selected.id, amount, currency, days)) {
      setNotice(`Listed ${cardArt(selected.ticker, selected.rarity, selected.tier).name} for ${priceText({ price: amount, currency })}.`);
      showToast({ kind: "success", title: `Card #${selected.id} listed`, detail: `For ${priceText({ price: amount, currency })}` });
      setPrice("");
      setSellId("");
    }
  }

  const sellPage = (
    <SellWorkspace
      fee={DEMO_MARKET_FEE}
      cards={demo.cards.map((c) => ({
        id: String(c.id),
        art: cardArt(c.ticker, c.rarity, c.tier),
        rarity: c.rarity,
        inside: `${tokenAmount(c.amount)} ${c.ticker}`,
        worth: worth(c),
        blocked: c.stakedAt !== null ? "Staked" : null,
      }))}
      empty={{ title: "No cards yet.", action: <Link href="/packs" className={stateAction}>Open a demo pack<ArrowUpRightIcon weight="bold" /></Link> }}
      selectedId={selected ? String(selected.id) : null}
      onSelect={setSellId}
      currency={currency}
      onCurrency={setCurrency}
      price={price}
      onPrice={setPrice}
      avaxUsd={avaxUsd}
      days={days}
      onDays={setDays}
      status={notice.startsWith("Listed") ? <p className="text-sm text-up" role="status">{notice} <Link href="/marketplace" className="underline underline-offset-4">See it on the market</Link></p> : null}
      submitLabel="List card"
      submitDisabled={false}
      onSubmit={submitListing}
      note="Demo: the card waits in the market until you cancel the listing."
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
            sortOptions={[{ value: "price", label: "Price: low to high" }, { value: "recent", label: "Newest listings" }]}
            stock={assets}
            action={mode === "browse" ? <SellButton /> : undefined}
          />
          <p className="mb-6 text-sm text-muted" role="status">{notice || "Simulated listings and balances · saved in this browser"}</p>

          {!pricesReady && market.listings.length === 0 ? (
            <MarketState kind="loading" title="Loading listings…" />
          ) : shown.length === 0 ? (
            market.listings.length ? (
              <MarketState title="Nothing listed here." action={<button type="button" className={stateAction} onClick={() => { setRarity("all"); assets.clear(); }}>Show all</button>} />
            ) : (
              <MarketState title="No listings yet." action={<Link href={SELL_HREF} className={stateAction}>Sell a card<ArrowUpRightIcon weight="bold" /></Link>} />
            )
          ) : (
            <ul className={listingGrid}>
              {shown.map((l) => {
                const own = l.seller === "you";
                const value = worth(l.card);
                const priceUsd = usdOf(l);
                const art = cardArt(l.card.ticker, l.card.rarity, l.card.tier);
                if (!art) return null;
                return (
                  <ListingCard
                    key={l.id}
                    art={art}
                    rarity={l.card.rarity}
                    badge={RARITY_NAMES[l.card.rarity]}
                    title={`demo card #${l.card.id}`}
                    price={
                      <span className="flex flex-col">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <TokenIcon symbol={l.currency} className="size-4 shrink-0" title={`Priced in ${l.currency}`} />
                          {priceText(l)}
                        </span>
                        {l.currency === "BNB" && priceUsd !== null && <span className="text-sm text-muted">≈ {dollars(priceUsd)}</span>}
                      </span>
                    }
                    details={[
                      { label: "Inside", value: `${tokenAmount(l.card.amount)} ${l.card.ticker}` },
                      { label: "Worth now", value: value === null ? "—" : usd(value) },
                      { label: "Paid in", value: l.currency },
                      { label: "Pack", value: PACK_TIERS[l.card.tier]?.name ?? "—" },
                      { label: "Seller", value: own ? "You" : l.seller },
                    ]}
                    action={
                      own ? (
                        <button type="button" className={listingButtonOutline} onClick={() => { if (market.cancel(l.id)) { setNotice("Listing cancelled. The card is back in your profile."); showToast({ kind: "success", title: "Listing cancelled", detail: "The card is back in your profile." }); } }}>Cancel listing</button>
                      ) : (
                        <button type="button" aria-haspopup="dialog" className={listingButton} disabled={(demo.balances[l.currency] ?? 0) < l.price} onClick={() => setConfirming(l)}>
                          {(demo.balances[l.currency] ?? 0) < l.price ? `Not enough ${l.currency}` : `Buy ${priceText(l)}`}
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
              <span className={sectionLabel}>[ fee {DEMO_MARKET_FEE * 100}% ]</span>
            </div>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => { event.preventDefault(); submitListing(); }}
            >
              <div className="flex flex-col gap-1.5 text-sm text-muted">
                <span id="demo-sell-card-label">Card</span>
                {/* Opens a picker showing every card you own. */}
                <button
                  type="button"
                  aria-labelledby="demo-sell-card-label"
                  aria-haspopup="dialog"
                  className={cn(cleanField, "flex items-center gap-3 text-left text-base text-foreground")}
                  onClick={() => setPicking(true)}
                >
                  {selected ? (
                    <>
                      <StockCardFront art={cardArt(selected.ticker, selected.rarity, selected.tier)} rarity={selected.rarity} decorative sizes="28px" className="w-7 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">#{selected.id} · {cardArt(selected.ticker, selected.rarity, selected.tier).name} · {RARITY_NAMES[selected.rarity]}</span>
                    </>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-muted">{demo.cards.length ? "Unstake a card to sell it" : "No cards yet. Open a demo pack"}</span>
                  )}
                  <span className="shrink-0 text-sm text-muted">{demo.cards.length > 0 ? "Change" : ""}</span>
                </button>
              </div>
              {selected && (
                <p className="text-sm text-muted">
                  Contains {selectedWorth !== null ? `$${selectedWorth.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${selected.ticker}` : `${amountText(selected.amount)} ${selected.ticker}`}
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
                <input className={cleanField} inputMode="decimal" placeholder={suggestion ?? "0.00"} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} />
              </label>
              <div className="flex gap-1.5" role="group" aria-label="Listing length">
                {DURATIONS.map((d) => (
                  <button key={d.days} type="button" aria-pressed={days === d.days} className="flex-1 rounded-md border border-border px-2 py-2 text-sm transition-colors hover:border-black aria-pressed:border-black" onClick={() => setDays(d.days)}>
                    {d.label}
                  </button>
                ))}
              </div>
              {valid && <p className="text-sm text-muted">You get {priceText({ price: payout, currency })} when it sells.</p>}
              <button type="submit" className={cn(cleanButton.solid, "mt-1 w-full justify-between")} disabled={!selected || !valid}>
                List card <ArrowUpRightIcon weight="bold" />
              </button>
              <p className="text-[13px] text-muted">Demo: the card waits in the market until you cancel the listing.</p>
            </form>
      </>}
      extra={<>
      {picking && (
        <CardPickerDialog
          cards={pickerCards}
          listedIds={new Set()}
          selectedId={selected ? String(selected.id) : null}
          worth={(c) => { const card = demo.cards.find((d) => String(d.id) === c.id.toString()); return card ? worth(card) : null; }}
          onSelect={setSellId}
          onClose={() => setPicking(false)}
        />
      )}


      {confirming && (() => {
        const l = confirming;
        const art = cardArt(l.card.ticker, l.card.rarity, l.card.tier);
        const have = demo.balances[l.currency] ?? 0;
        const value = worth(l.card);
        const priceUsd = usdOf(l);
        const money = (n: number) => (l.currency === "BNB" ? avaxText(n) : dollars(n));
        return art ? (
          <BuyConfirmDialog
            art={art}
            rarity={l.card.rarity}
            inside={`${tokenAmount(l.card.amount)} ${l.card.ticker}`}
            worth={value === null ? "—" : dollars(value)}
            price={priceText(l)}
            priceUsd={l.currency === "BNB" && priceUsd !== null ? `≈ ${dollars(priceUsd)}` : undefined}
            balance={money(have)}
            after={money(have - l.price)}
            seller={l.seller}
            insufficient={have < l.price}
            onConfirm={() => { buy(l); setConfirming(null); }}
            onClose={() => setConfirming(null)}
          />
        ) : null;
      })()}
      </>}
    />
  );
}
