"use client";

import { TokenIcon } from "@/components/token-icon";
import { ArrowUpRightIcon, CaretDownIcon, CheckIcon, CardsIcon, CircleNotchIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { cleanChip, cleanDrawerRight, cn, dialogClose, dialogFooter } from "@/components/clean-ui";
import { TierPackArt } from "@/components/pack-art";
import { Holo, StockCardFront, tilt } from "@/components/stock-card-front";
import type { StockCard } from "@/lib/cards";

/** Section title and bracketed label, as on /trade and /dao. */
export const sectionTitle = "text-[28px] leading-[1.2] font-light tracking-tight";
export const sectionLabel = "text-base text-muted";

/** Two hairline-split columns (listings | sell), like /trade's swap and chart. */
export const marketGrid = "market-grid mt-10 grid grid-cols-1 border-t border-border desk:mt-16 desk:grid-cols-[minmax(0,1fr)_340px] wide:grid-cols-[minmax(0,1fr)_380px]";
export const marketMain = "min-w-0 py-8 desk:pt-10 desk:pr-8";
export const marketSide = "border-border max-desk:border-t desk:border-l";
/** A section in the side column; add `sideRule` to every one after the first. */
export const sidePanel = "py-8 desk:pl-8";
export const sideRule = "border-t border-border";

/** Where the market shows: listings beside the sell form ("both", /v2), listings with a Sell button ("browse", /marketplace), or the sell form alone ("sell", /marketplace/sell). */
export type MarketMode = "both" | "browse" | "sell";

export const SELL_HREF = "/marketplace/sell";

/** The market's main action, top right of the title row. -my-1.5 keeps the 40px button from making the row taller than the heading, so the title sits at the same height as other pages' titles. */
export function SellButton() {
  return (
    <Link href={SELL_HREF} className="-my-1.5 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border-[1.5px] border-black bg-black px-4 text-sm text-white">
      Sell a card<ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" />
    </Link>
  );
}

/**
 * Lays out a market view for its mode. `sell` is the sell column, or the whole
 * page in "sell" mode (the SellWorkspace); `extra` is anything every mode keeps (errors, dialogs).
 */
export function MarketLayout({ mode, floor, listings, sell, extra }: { mode: MarketMode; floor?: ReactNode; listings: ReactNode; sell: ReactNode; extra?: ReactNode }) {
  if (mode === "sell") {
    return (
      <div className="market-workspace pt-6 pb-16 desk:pt-10">
        {sell}
        {extra}
      </div>
    );
  }
  return (
    <div className="market-workspace pt-6 pb-16 desk:pt-10">
      {floor}
      {mode === "browse" ? (
        <div className={floor ? "mt-10 border-t border-border desk:mt-16" : undefined}>
          <section className={cn("min-w-0", floor ? "py-8 desk:pt-10" : "pb-8")} aria-label="Listings">{listings}</section>
        </div>
      ) : (
        <div className={marketGrid}>
          <section className={marketMain} aria-label="Listings">{listings}</section>
          <aside className={marketSide}>
            <section className={cn(sidePanel, "desk:pt-10")}>{sell}</section>
          </aside>
        </div>
      )}
      {extra}
    </div>
  );
}

/**
 * Empty, error and loading states for the market and sell page: a tall dashed
 * box with an icon, one short line and an optional action, so an empty list
 * still holds the page's shape.
 */
export function MarketState({ kind = "empty", title, action }: { kind?: "empty" | "error" | "loading"; title: ReactNode; action?: ReactNode }) {
  const Glyph = kind === "error" ? WarningCircleIcon : kind === "loading" ? CircleNotchIcon : CardsIcon;
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-5 rounded-lg border border-dashed border-border-strong px-6 py-16 text-center desk:min-h-[440px]" role={kind === "error" ? "alert" : "status"}>
      <Glyph aria-hidden="true" className={cn("size-7", kind === "error" ? "text-down" : "text-muted", kind === "loading" && "animate-spin")} />
      <p className="text-xl">{title}</p>
      {action && <div className="flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Small outlined button for a state's action. */
export const stateAction = "inline-flex min-h-10 items-center gap-2 rounded-md border border-border-strong bg-white px-4 text-sm text-black transition-colors hover:border-black";

/** A filter chip: one asset, with its floor (USD) when it has listings. */
export type AssetChip = { ticker: string; name: string; count: number; floor: number | null };

const ASSET_EVENT = "market-asset";
function subscribeAsset(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(ASSET_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(ASSET_EVENT, onChange);
  };
}
const readAsset = () => new URLSearchParams(window.location.search).get("asset")?.toUpperCase() ?? "";

/** The selected asset, kept in the URL (?asset=NVDA) so a filtered market can be shared. */
export function useAssetParam(): [string, (ticker: string) => void] {
  const asset = useSyncExternalStore(subscribeAsset, readAsset, () => "");
  const setAsset = useCallback((ticker: string) => {
    const url = new URL(window.location.href);
    if (ticker) url.searchParams.set("asset", ticker);
    else url.searchParams.delete("asset");
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(ASSET_EVENT));
  }, []);
  return [asset, setAsset];
}

/**
 * Asset chips and search for a market's listings. `keep` picks the assets that
 * always get a chip; any other asset gets one only while it has a listing.
 * Counts and floors follow `inView` (e.g. the rarity filter).
 */
export function useAssetFilter<L>({ cards, keep, listings, tickerOf, usdOf, inView = () => true }: {
  cards: StockCard[];
  keep: (card: StockCard) => boolean;
  listings: L[];
  tickerOf: (l: L) => string;
  usdOf: (l: L) => number | null;
  inView?: (l: L) => boolean;
}) {
  const [asset, setAsset] = useAssetParam();
  const [query, setQuery] = useState("");
  const listed = new Set(listings.map(tickerOf));
  const chips: AssetChip[] = cards
    .filter((card) => keep(card) || listed.has(card.ticker))
    .map((card) => {
      const forCard = listings.filter((l) => tickerOf(l) === card.ticker && inView(l));
      const prices = forCard.map(usdOf).filter((p): p is number => p !== null);
      return { ticker: card.ticker, name: card.tokenName, count: forCard.length, floor: prices.length ? Math.min(...prices) : null };
    })
    .sort((a, b) => Number(b.count > 0) - Number(a.count > 0));
  const q = query.trim().toLowerCase();
  const found = q ? chips.filter((c) => c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) : chips;
  const foundTickers = new Set(found.map((c) => c.ticker));
  /** Whether a listing passes the picked chip, or the search when no chip is picked. */
  const matches = (l: L) => (asset ? tickerOf(l) === asset : !q || foundTickers.has(tickerOf(l)));
  const clear = () => { setAsset(""); setQuery(""); };
  return { asset, setAsset, query, setQuery, chips: found, matches, clear, filtering: Boolean(asset || q) };
}

const floorText = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n >= 1 ? 2 : 4 })}`;

/** Title with the listing count and the main action, then rarity chips, the stock filter and the sort. */
export function ListingsHeader({ count, filters, value, onFilter, sort, onSort, sortOptions, stock, action }: {
  count: number;
  filters: { label: string; value: string | number }[];
  value: string | number;
  onFilter: (value: string | number) => void;
  sort: string;
  onSort: (value: string) => void;
  sortOptions: { value: string; label: string }[];
  /** Stock filter: the asset filter's chips, shown as one dropdown. */
  stock?: Pick<ReturnType<typeof useAssetFilter>, "asset" | "setAsset" | "chips">;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className={sectionTitle}>Listings</h1>
          <span className={sectionLabel}>[{String(count).padStart(2, "0")}]</span>
        </div>
        {action}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {/* Phones: one row you can swipe instead of wrapping. */}
        {filters.length > 0 && (
          <div className="flex gap-1.5 max-phone:-mx-[18px] max-phone:w-[calc(100%+36px)] max-phone:overflow-x-auto max-phone:px-[18px] phone:flex-wrap" role="group" aria-label="Filter by rarity">
            {filters.map((f) => (
              <button key={String(f.value)} type="button" className={cn(cleanChip, "shrink-0")} aria-pressed={value === f.value} onClick={() => onFilter(f.value)}>{f.label}</button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          {stock && (
            <PickMenu
              label="Stock"
              ariaLabel="Filter by stock"
              value={stock.asset}
              options={[{ value: "", label: "All" }, ...stock.chips.map((c) => ({ value: c.ticker, label: c.ticker, note: c.floor !== null ? floorText(c.floor) : undefined, icon: <TokenIcon symbol={c.ticker} className="size-4" /> }))]}
              onChange={stock.setAsset}
            />
          )}
          <SortMenu value={sort} options={sortOptions} onChange={onSort} />
        </div>
      </div>
    </div>
  );
}

type PickOption = { value: string; label: string; note?: string; icon?: ReactNode };

/** Sort dropdown in the chips' style. */
export function SortMenu({ value, options, onChange }: { value: string; options: PickOption[]; onChange: (value: string) => void }) {
  return <PickMenu label="Sort" ariaLabel="Sort listings" value={value} options={options} onChange={onChange} />;
}

/** A small dropdown in the chips' style; like the packs page's token picker it closes on blur, Escape or a pick. */
export function PickMenu({ label, ariaLabel, value, options, onChange }: { label: string; ariaLabel: string; value: string; options: PickOption[]; onChange: (value: string) => void }) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const close = (picker: HTMLDetailsElement | null) => {
    if (!picker) return;
    picker.open = false;
    picker.querySelector("summary")?.focus();
  };
  return (
    <details
      className="group relative"
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
      onKeyDown={(event) => { if (event.key === "Escape") close(event.currentTarget); }}
    >
      <summary aria-label={`${label}: ${current.label}`} className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors hover:border-border-strong group-open:border-black [&::-webkit-details-marker]:hidden">
        <span className="text-muted">{label}</span>
        {current.icon}
        {current.label}
        <CaretDownIcon className="text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="frost absolute top-[calc(100%+8px)] left-0 desk:right-0 desk:left-auto z-20 max-h-[min(360px,60dvh)] w-[220px] overflow-y-auto animate-[popover-in_.15s_ease-out] rounded-md border border-border bg-white/72 backdrop-blur-[14px] p-1.5 shadow-[0_12px_30px_#0000001a]" role="group" aria-label={ariaLabel}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            className="flex min-h-9 w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-muted aria-pressed:bg-surface-muted"
            onClick={(event) => { onChange(o.value); close(event.currentTarget.closest("details")); }}
          >
            {o.icon}
            <span className="flex-1">{o.label}</span>
            {o.note && <span className="text-muted tabular-nums">{o.note}</span>}
            {o.value === value && <CheckIcon aria-hidden="true" />}
          </button>
        ))}
      </div>
    </details>
  );
}

const cardFace = "holo-card relative block aspect-[1024/1536] w-full overflow-hidden rounded-[4px] shadow-[0_10px_24px_-14px_rgba(0,0,0,.45)]";

/**
 * One listing: the card with its name, price and action beneath. Clicking the
 * card opens a dialog with the full details (backing, seller, links).
 */
export function ListingCard({ art, rarity, badge, status, title, price, details, action, link, showName = true }: {
  art: StockCard;
  /** 0 common … 3 legendary; sets the foil. */
  rarity: number;
  badge: string;
  /** Your card's state ("staked", "listed"), shown as a black tag on the art opposite the rarity. */
  status?: string;
  /** Dialog label, e.g. "card #12". */
  title: string;
  price: ReactNode;
  details: { label: string; value: ReactNode }[];
  action: ReactNode;
  link?: ReactNode;
  /** The name/ticker row under the art; the art already shows both, so lists can drop it. */
  showName?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const face = (sizes: string) => <>
    <StockCardFront art={art} decorative className="size-full" sizes={sizes} rarity={rarity} />
    <Holo rarity={rarity} />
    <span className="holo-glare" aria-hidden="true" />
  </>;

  return (
    // Column layout with the action pinned to the bottom, so buttons line up across a row
    // even when one price has an extra line (e.g. "≈ $1.32" under an BNB price).
    <li className="flex min-w-0 flex-col">
      <button type="button" aria-haspopup="dialog" aria-label={`${art.name}, ${badge}. Show details.`} onClick={() => dialog.current?.showModal()} {...tilt} className={cn(cardFace, "focus-visible:outline-offset-[6px]")}>
        {face("(max-width: 700px) 45vw, 200px")}
        <span className="absolute top-[16%] left-1.5 rounded-[4px] bg-white px-2 py-0.5 text-[11px] lowercase">{badge}</span>
        {status && <span className="absolute top-[16%] right-1.5 rounded-[4px] bg-black px-2 py-0.5 text-[11px] text-white lowercase">{status}</span>}
      </button>
      <div className="mt-3 flex flex-1 flex-col gap-1">
        {showName && (
          <div className="flex items-baseline justify-between gap-2">
            <strong className="truncate text-base font-normal">{art.name}</strong>
            <span className="text-[13px] text-muted">{art.ticker}</span>
          </div>
        )}
        <p className="text-xl tracking-[-0.02em] tabular-nums">{price}</p>
        {/* Two buttons share the row equally and never wrap their labels. */}
        <div className="mt-auto pt-2 [&_a]:whitespace-nowrap [&_button]:whitespace-nowrap">{action}</div>
      </div>

      <dialog
        ref={dialog}
        className={cn(cleanDrawerRight, "w-[min(420px,calc(100vw-16px))]")}
        aria-label={`${art.name} details`}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      >
        <header className="sticky top-0 z-10 bg-white flex items-center justify-between border-b border-border px-5 py-4">
          <span className={sectionLabel}>[ {title} ]</span>
          <button type="button" className={dialogClose} aria-label="Close details" onClick={() => dialog.current?.close()}><XIcon className="size-[18px]" /></button>
        </header>
        {/* A right-hand drawer: the art on top, then name, price and details, scrolling between the header and the footer. */}
        <div className="flex flex-col gap-6 p-5 phone:p-6">
          <div {...tilt} className={cn(cardFace, "mx-auto w-[180px]")}>{face("180px")}</div>
          <div className="flex min-w-0 flex-col">
            <h2 className={sectionTitle}>{art.name}</h2>
            <p className="mt-1 text-sm text-muted">{badge} · {art.ticker}</p>
            <p className="mt-4 text-[28px] leading-[1.2] tracking-tight tabular-nums">{price}</p>
            <dl className="mt-4 border-t border-border">
              {details.map((d) => (
                <div key={d.label} className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-sm">
                  <dt className="text-muted">{d.label}</dt>
                  <dd className="min-w-0 truncate text-right tabular-nums">{d.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        {/* The action pinned to the bottom, the explorer link centred under it. A control that opens its own dialog
            (connect wallet) closes this one first, so it isn't left underneath. */}
        <div className={cn(dialogFooter, "flex flex-col gap-3")}>
          <div onClickCapture={(event) => { if ((event.target as HTMLElement).closest('[aria-haspopup="dialog"]')) dialog.current?.close(); }}>{action}</div>
          {link && <div className="flex justify-center text-sm text-muted">{link}</div>}
        </div>
      </dialog>
    </li>
  );
}

/**
 * A sealed pack listing, laid out like ListingCard: the pack in the same card
 * frame, name and tier underneath, and the details in the same dialog.
 */
export function PackListingCard({ tier, id, name, badge, price, details, action, link }: {
  tier: number;
  id: bigint;
  /** e.g. "Fable pack". */
  name: string;
  badge: string;
  price: ReactNode;
  details: { label: string; value: ReactNode }[];
  action: ReactNode;
  link?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const packFace = "relative block aspect-[1024/1536] w-full overflow-hidden rounded-[4px] bg-surface-muted";
  return (
    <li className="min-w-0">
      <button type="button" aria-haspopup="dialog" aria-label={`${name} #${String(id)}, ${badge}. Show details.`} onClick={() => dialog.current?.showModal()} className={cn(packFace, "focus-visible:outline-offset-[6px]")}>
        <TierPackArt tier={tier} id={id} className="size-full" />
        <span className="absolute top-[16%] left-1.5 rounded-[4px] bg-white px-2 py-0.5 text-[11px] lowercase">{badge}</span>
        {status && <span className="absolute top-[16%] right-1.5 rounded-[4px] bg-black px-2 py-0.5 text-[11px] text-white lowercase">{status}</span>}
      </button>
      <div className="mt-3 flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <strong className="truncate text-base font-normal">{name}</strong>
          <span className="text-[13px] text-muted">#{String(id)}</span>
        </div>
        <p className="text-xl tracking-[-0.02em] tabular-nums">{price}</p>
        <div className="mt-2">{action}</div>
      </div>

      <dialog
        ref={dialog}
        className={cn(cleanDrawerRight, "w-[min(420px,calc(100vw-16px))]")}
        aria-label={`${name} details`}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      >
        <header className="sticky top-0 z-10 bg-white flex items-center justify-between border-b border-border px-5 py-4">
          <span className={sectionLabel}>[ pack #{String(id)} ]</span>
          <button type="button" className={dialogClose} aria-label="Close details" onClick={() => dialog.current?.close()}><XIcon className="size-[18px]" /></button>
        </header>
        {/* A right-hand drawer: the art on top, then name, price and details, scrolling between the header and the footer. */}
        <div className="flex flex-col gap-6 p-5 phone:p-6">
          <div className={cn(packFace, "mx-auto w-[180px]")}><TierPackArt tier={tier} id={id} className="size-full" /></div>
          <div className="flex min-w-0 flex-col">
            <h2 className={sectionTitle}>{name}</h2>
            <p className="mt-1 text-sm text-muted">{badge} · #{String(id)}</p>
            <p className="mt-4 text-[28px] leading-[1.2] tracking-tight tabular-nums">{price}</p>
            <dl className="mt-4 border-t border-border">
              {details.map((d) => (
                <div key={d.label} className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-sm">
                  <dt className="text-muted">{d.label}</dt>
                  <dd className="min-w-0 truncate text-right tabular-nums">{d.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        {/* The action pinned to the bottom, the explorer link centred under it. A control that opens its own dialog
            (connect wallet) closes this one first, so it isn't left underneath. */}
        <div className={cn(dialogFooter, "flex flex-col gap-3")}>
          <div onClickCapture={(event) => { if ((event.target as HTMLElement).closest('[aria-haspopup="dialog"]')) dialog.current?.close(); }}>{action}</div>
          {link && <div className="flex justify-center text-sm text-muted">{link}</div>}
        </div>
      </dialog>
    </li>
  );
}

/** Buy / cancel button under a listing. */
export const listingButton = "min-h-10 w-full rounded-md border-[1.5px] border-black bg-black px-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40";

/** Secondary action beside listingButton (unstake, redeem, market). */
export const listingButtonOutline = "min-h-10 w-full rounded-md border border-border px-3 text-sm transition-colors hover:border-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border";

/** Listing grid: two up on phones, then as many ~200px cards as fit. */
export const listingGrid = "grid grid-cols-2 gap-x-3.5 gap-y-6 phone:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] desk:gap-x-6 desk:gap-y-10";
