"use client";

import { ArrowLeftIcon, ArrowUpRightIcon, CheckIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { cleanButton, cleanChip, cleanField, cn } from "@/components/clean-ui";
import { MarketState, SortMenu, stateAction, sectionLabel, sectionTitle } from "@/components/market-parts";
import { StockCardFront } from "@/components/stock-card-front";
import { TokenIcon } from "@/components/token-icon";
import type { StockCard } from "@/lib/cards";
import { RARITY_NAMES } from "@/lib/contracts";

/** One of your cards, ready for the sell grid. */
export type SellCard = {
  id: string;
  art: StockCard;
  rarity: number;
  /** e.g. "0.0004 ETH". */
  inside: string;
  /** What it holds now, in USD. */
  worth: number | null;
  /** Why it can't be listed ("Staked", "Listed"), if it can't. */
  blocked?: string | null;
  /** Your live listing of this card, if any: picking it offers Cancel listing. */
  listing?: { price: string; ends: string } | null;
};

export type SellCurrency = "USDT" | "BNB";

const DURATIONS = [
  { label: "1 day", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];
const dollars = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inCurrency = (n: number, c: SellCurrency) => (c === "USDT" ? dollars(n) : `${n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 4 })} BNB`);

/**
 * The sell page: every card you own in a big grid to pick from, and the listing
 * form beside it (below it on phones). Data and the listing call come from the
 * live, demo or "opening soon" market.
 */
export function SellWorkspace({
  fee, cards, loading, empty, selectedId, onSelect,
  currency, onCurrency, price, onPrice, avaxUsd, days, onDays,
  status, submitLabel, submitDisabled, onSubmit, note, onCancel, cancelBusy,
}: {
  fee: number;
  cards: SellCard[];
  loading?: boolean;
  /** Shown instead of the grid when you have no cards (or no wallet). */
  empty: { title: ReactNode; action?: ReactNode };
  selectedId: string | null;
  onSelect: (id: string) => void;
  currency: SellCurrency;
  onCurrency: (c: SellCurrency) => void;
  price: string;
  onPrice: (v: string) => void;
  avaxUsd: number | null;
  days: number;
  onDays: (d: number) => void;
  status?: ReactNode;
  submitLabel: string;
  submitDisabled: boolean;
  onSubmit: () => void;
  note: string;
  /** Cancel your listing of a card. */
  onCancel?: (id: string) => void;
  cancelBusy?: boolean;
}) {
  const [rarity, setRarity] = useState<number | "all">("all");
  const [sort, setSort] = useState<"value" | "newest">("value");
  const shown = useMemo(() => {
    const list = rarity === "all" ? cards : cards.filter((c) => c.rarity === rarity);
    // Listable cards first, then by the chosen order.
    return [...list].sort((a, b) =>
      Number(Boolean(a.blocked)) - Number(Boolean(b.blocked)) ||
      (sort === "value" ? (b.worth ?? -1) - (a.worth ?? -1) : Number(BigInt(b.id) - BigInt(a.id))),
    );
  }, [cards, rarity, sort]);
  const selected = cards.find((c) => c.id === selectedId && !c.blocked) ?? null;
  const selectedListing = cards.find((c) => c.id === selectedId && c.listing) ?? null;
  const listable = cards.filter((c) => !c.blocked).length;

  const amount = Number(price);
  const valid = price.trim() !== "" && Number.isFinite(amount) && amount > 0;
  // Suggested price: what the card holds, in the chosen currency.
  const suggestion = selected?.worth == null ? null : currency === "USDT" ? selected.worth.toFixed(2) : avaxUsd ? (selected.worth / avaxUsd).toFixed(4) : null;

  return (
    <div>
      {/* Mirrors the market's Floor row: title left, the way back top right where "Sell a card" sits there. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-[22px] leading-[1.3] font-normal tracking-tight">List a card</h1>
        <Link href="/marketplace" className="-my-1.5 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-border-strong bg-white px-3.5 text-sm text-black transition-colors hover:border-black"><ArrowLeftIcon weight="bold" />Back to market</Link>
      </div>

      <div className="mt-8 grid grid-cols-1 border-t border-border desk:mt-10 desk:grid-cols-[minmax(0,1fr)_360px] wide:grid-cols-[minmax(0,1fr)_400px]">
        {/* Your cards */}
        <section className="min-w-0 py-8 desk:pr-8" aria-labelledby="sell-cards-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="sell-cards-title" className={sectionTitle}>Your cards</h2>
            {cards.length > 0 && <span className={sectionLabel}>[{String(listable).padStart(2, "0")} to sell]</span>}
          </div>

          {cards.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1.5 max-phone:-mx-[18px] max-phone:w-[calc(100%+36px)] max-phone:overflow-x-auto max-phone:px-[18px] phone:flex-wrap" role="group" aria-label="Filter by rarity">
                {(["all", 0, 1, 2, 3] as const).map((r) => (
                  <button key={r} type="button" className={cn(cleanChip, "shrink-0")} aria-pressed={rarity === r} onClick={() => setRarity(r)}>
                    {r === "all" ? "All" : RARITY_NAMES[r]}
                  </button>
                ))}
              </div>
              <SortMenu value={sort} options={[{ value: "value", label: "Value: high to low" }, { value: "newest", label: "Newest" }]} onChange={(v) => setSort(v as "value" | "newest")} />
            </div>
          )}

          {loading && cards.length === 0 ? (
            <div className="mt-6"><MarketState kind="loading" title="Loading your cards…" /></div>
          ) : cards.length === 0 ? (
            <div className="mt-6"><MarketState title={empty.title} action={empty.action} /></div>
          ) : shown.length === 0 ? (
            <div className="mt-6"><MarketState title="No cards in that rarity." action={<button type="button" className={stateAction} onClick={() => setRarity("all")}>Show all</button>} /></div>
          ) : (
            <ul className="mt-6 grid list-none grid-cols-2 gap-3 p-0 phone:grid-cols-3 desk:gap-4 wide:grid-cols-4" role="listbox" aria-label="Your cards">
              {shown.map((c) => {
                const picked = c.id === selected?.id || c.id === selectedListing?.id;
                // Listed cards stay pickable so the listing can be cancelled.
                const locked = Boolean(c.blocked) && !c.listing;
                return (
                  <li key={c.id} role="option" aria-selected={picked} aria-disabled={locked}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => { onSelect(c.id); onPrice(""); }}
                      className={cn(
                        "relative flex w-full flex-col gap-3 rounded-lg border-[1.5px] p-2.5 text-left transition-colors",
                        picked ? "border-black" : "border-border hover:border-border-strong",
                        locked && "cursor-not-allowed opacity-45 hover:border-border",
                        c.listing && !picked && "opacity-70",
                      )}
                    >
                      <StockCardFront art={c.art} rarity={c.rarity} decorative sizes="(min-width: 1201px) 220px, (min-width: 481px) 30vw, 45vw" className="w-full" />
                      <span className="min-w-0 px-0.5 pb-0.5">
                        <span className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate">#{c.id}</span>
                          <span className="shrink-0 text-muted">{RARITY_NAMES[c.rarity]}</span>
                        </span>
                        <span className="mt-1 block truncate text-base tabular-nums">{c.worth === null ? "—" : dollars(c.worth)}</span>
                        <span className="block truncate text-[13px] text-muted tabular-nums">{c.listing ? `Listed · ${c.listing.price}` : c.blocked ? (c.blocked === "Staked" ? "Staked: unstake to sell" : "Already listed") : c.inside}</span>
                      </span>
                      {picked && <span className="absolute top-4 right-4 grid size-7 place-items-center rounded-full bg-black text-white"><CheckIcon className="size-4" /></span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Listing form: sticks beside the grid on desktop. */}
        <aside className="border-border max-desk:border-t desk:border-l">
          <form
            id="sell-form"
            className="flex flex-col gap-5 py-8 desk:sticky desk:top-24 desk:pl-8"
            aria-labelledby="sell-form-title"
            onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="sell-form-title" className={sectionTitle}>Listing</h2>
              <span className={sectionLabel}>[ fee {fee * 100}% ]</span>
            </div>

            {selectedListing ? (
              <>
                <div className="flex items-center gap-4">
                  <StockCardFront art={selectedListing.art} rarity={selectedListing.rarity} decorative sizes="64px" className="w-16 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-base">{selectedListing.art.name}</p>
                    <p className="text-sm text-muted">#{selectedListing.id} · {RARITY_NAMES[selectedListing.rarity]}</p>
                    <p className="text-sm text-muted tabular-nums">{selectedListing.inside}</p>
                  </div>
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 border-t border-border pt-5 text-sm">
                  <dt className="text-muted">Listed for</dt>
                  <dd className="text-right text-base tabular-nums">{selectedListing.listing!.price}</dd>
                  <dt className="text-muted">Ends</dt>
                  <dd className="text-right tabular-nums">{selectedListing.listing!.ends}</dd>
                </dl>
                {status}
                <button type="button" className={cn(cleanButton.outline, "w-full justify-between")} disabled={cancelBusy || !onCancel} onClick={() => onCancel?.(selectedListing.id)}>
                  {cancelBusy ? "Cancelling…" : "Cancel listing"} <ArrowUpRightIcon weight="bold" />
                </button>
              </>
            ) : selected ? (
              <div className="flex items-center gap-4">
                <StockCardFront art={selected.art} rarity={selected.rarity} decorative sizes="64px" className="w-16 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-base">{selected.art.name}</p>
                  <p className="text-sm text-muted">#{selected.id} · {RARITY_NAMES[selected.rarity]}</p>
                  <p className="text-sm text-muted tabular-nums">{selected.inside}{selected.worth !== null && ` · ${dollars(selected.worth)}`}</p>
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">Pick a card</p>
            )}

            {!selectedListing && <>
            <div className="flex flex-col gap-1.5 text-sm text-muted">
              <span>Get paid in</span>
              <div className="flex gap-1.5" role="group" aria-label="Listing currency">
                {(["USDT", "BNB"] as const).map((c) => (
                  <button key={c} type="button" aria-pressed={currency === c} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-border text-sm text-black transition-colors hover:border-border-strong aria-pressed:border-black" onClick={() => { onCurrency(c); onPrice(""); }}>
                    <TokenIcon symbol={c} className="size-4" /> {c}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1.5 text-sm text-muted">
              <span className="flex items-baseline justify-between gap-2">
                <span>Price ({currency})</span>
                {suggestion && (
                  <button type="button" className="text-black underline-offset-4 hover:underline" onClick={() => onPrice(suggestion)}>Use worth {currency === "USDT" ? `$${suggestion}` : `${suggestion} BNB`}</button>
                )}
              </span>
              <input className={cleanField} inputMode="decimal" placeholder={suggestion ?? "0.00"} value={price} disabled={!selected} onChange={(e) => onPrice(e.target.value.replace(/[^0-9.]/g, ""))} />
            </label>

            <div className="flex flex-col gap-1.5 text-sm text-muted">
              <span>Ends in</span>
              <div className="flex gap-1.5" role="group" aria-label="Listing length">
                {DURATIONS.map((d) => (
                  <button key={d.days} type="button" aria-pressed={days === d.days} className="h-11 flex-1 rounded-md border border-border text-sm text-black transition-colors hover:border-border-strong aria-pressed:border-black" onClick={() => onDays(d.days)}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 border-t border-border pt-5 text-sm">
              <dt className="text-muted">Price</dt>
              <dd className="text-right tabular-nums">{valid ? inCurrency(amount, currency) : "—"}</dd>
              <dt className="text-muted">Fee {fee * 100}%</dt>
              <dd className="text-right tabular-nums">{valid ? `−${inCurrency(amount * fee, currency)}` : "—"}</dd>
              <dt className="text-base">You get</dt>
              <dd className="text-right text-base tabular-nums">{valid ? inCurrency(amount * (1 - fee), currency) : "—"}</dd>
            </dl>

            {status}

            <button type="submit" className={cn(cleanButton.solid, "w-full justify-between")} disabled={submitDisabled || !selected || !valid}>
              {submitLabel} <ArrowUpRightIcon weight="bold" />
            </button>
            <p className="text-[13px] text-muted">{note}</p>
            </>}
          </form>
        </aside>
      </div>

      {/* Phones: once a card is picked, a bar to jump to its price. */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white px-[18px] py-3 desk:hidden">
          <a href="#sell-form" className="flex items-center gap-3">
            <StockCardFront art={selected.art} rarity={selected.rarity} decorative sizes="32px" className="w-8 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm">#{selected.id} · {RARITY_NAMES[selected.rarity]}</span>
            <span className={cn(cleanButton.small, "border-black bg-black text-white")}>Set price</span>
          </a>
        </div>
      )}
    </div>
  );
}
