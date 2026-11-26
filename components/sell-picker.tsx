"use client";

import { CaretDownIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useRef, useState } from "react";

import { CardAvatar } from "@/components/card-avatar";
import { cleanChip, cleanDialog, cleanField, cn, dialogClose, dialogHeader, dialogLabel, RARITY_DOT } from "@/components/clean-ui";
import { RARITY_NAMES } from "@/lib/contracts";
import { usd } from "@/lib/use-stock-prices";

/** One sellable card or sealed pack, already labelled by the market page. */
export type SellItem = {
  value: string;
  id: bigint;
  title: string;
  ticker?: string;
  rarity?: number;
  worth: number;
};

const PACKS = -1;
/** Centre of the card art, zoomed so the round thumb shows the emblem. */
const thumbCrop = (ticker: string) => ({ ticker, x: 5000, y: 4200, zoom: 230 });

function Thumb({ item, size = "size-10" }: { item: SellItem; size?: string }) {
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-muted text-sm", size)}>
      {item.ticker ? <CardAvatar crop={thumbCrop(item.ticker)} fallback={item.ticker.slice(0, 1)} /> : "▣"}
    </span>
  );
}

const subOf = (item: SellItem) => `#${String(item.id)} · ${item.rarity !== undefined ? RARITY_NAMES[item.rarity] : "Sealed pack"}`;

/**
 * The chosen card as one row, with a sheet to change it. The sell panel stays
 * the same height however many cards the wallet holds; the sheet searches,
 * filters by rarity and sorts by value.
 */
export function SellPicker({ items, value, onChange }: { items: SellItem[]; value?: string; onChange: (value: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<number | "all">("all");
  const chosen = items.find((i) => i.value === value) ?? items[0];

  const groups = [...new Set(items.map((i) => i.rarity ?? PACKS))].sort((a, b) => (a === PACKS ? 1 : b === PACKS ? -1 : a - b));
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const shown = items
    .filter((i) => filter === "all" || (i.rarity ?? PACKS) === filter)
    .filter((i) => !q || String(i.id) === q || `${i.title} ${i.ticker ?? ""} ${subOf(i)}`.toLowerCase().includes(q))
    .sort((a, b) => b.worth - a.worth);

  function open() {
    setQuery("");
    setFilter("all");
    dialog.current?.showModal();
  }
  function pick(v: string) {
    onChange(v);
    dialog.current?.close();
  }

  if (!chosen) return null;
  return (
    <>
      <button type="button" className="flex w-full items-center gap-3 text-left disabled:cursor-default" disabled={items.length < 2} onClick={open} aria-haspopup="dialog">
        <Thumb item={chosen} />
        <span className="flex min-w-0 flex-col">
          <strong className="truncate text-xl leading-snug font-normal">{chosen.title}</strong>
          <span className="text-sm leading-snug text-muted">{subOf(chosen)}</span>
        </span>
        {items.length > 1 && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-strong bg-white py-1.5 pr-2.5 pl-3 text-sm transition-colors hover:border-black">
            Change <CaretDownIcon className="text-muted" />
          </span>
        )}
      </button>

      <dialog
        ref={dialog}
        className={cn(cleanDialog, "w-[min(480px,calc(100%-32px))] max-desk:mt-auto max-desk:mb-0 max-desk:w-full max-desk:max-w-none max-desk:rounded-b-none max-desk:pb-[env(safe-area-inset-bottom)]")}
        aria-labelledby="sell-picker-title"
        onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}
      >
        <header className={dialogHeader}>
          <h2 id="sell-picker-title" className={dialogLabel}>[ choose what to sell · {items.length} ]</h2>
          <button type="button" className={dialogClose} aria-label="Close" onClick={() => dialog.current?.close()}><XIcon /></button>
        </header>
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
          <input
            type="search"
            className={cn(cleanField, "h-10 text-sm")}
            placeholder="Search name, ticker or #id"
            aria-label="Search your cards and packs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // preventDefault: otherwise the Enter re-clicks "Change" once focus returns to it and reopens the sheet.
            onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { e.preventDefault(); pick(shown[0].value); } }}
          />
          {groups.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
              <button type="button" className={cleanChip} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
              {groups.map((g) => (
                <button key={g} type="button" className={cn(cleanChip, "inline-flex items-center gap-1.5")} aria-pressed={filter === g} onClick={() => setFilter(g)}>
                  {g !== PACKS && <span className="size-1.5 rounded-full" style={{ background: RARITY_DOT[g] }} aria-hidden="true" />}
                  {g === PACKS ? "Packs" : RARITY_NAMES[g]}
                </button>
              ))}
            </div>
          )}
        </div>
        <ul className="max-h-[min(420px,55dvh)] overflow-y-auto p-2">
          {shown.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted aria-[current=true]:bg-accent-soft"
                aria-current={item.value === chosen.value ? "true" : undefined}
                onClick={() => pick(item.value)}
              >
                <Thumb item={item} size="size-9" />
                <span className="flex min-w-0 flex-col">
                  <strong className="truncate text-base leading-snug font-normal">{item.title}</strong>
                  <span className="text-sm leading-snug text-muted">{subOf(item)}</span>
                </span>
                <span className="ml-auto pl-2 text-sm tabular-nums">{usd(item.worth)}</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-6 text-sm text-muted">No match.</li>}
        </ul>
      </dialog>
    </>
  );
}
