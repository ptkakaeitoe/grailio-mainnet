"use client";

import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useState } from "react";
import { cleanButton, cn } from "@/components/clean-ui";
import { useDemo } from "@/components/demo-provider";
import { DemoPackReveal } from "@/components/demo-pack-reveal";
import { LivePackReveal } from "@/components/live-pack-reveal";
import { WalletEntry } from "@/components/wallet-entry";
import { SHOWN_TIERS } from "@/lib/contracts";
import { collectPacksLive } from "@/lib/collect-packs";
import { EDITIONS, editionForTier } from "@/lib/editions";
import { MiniPackArt } from "@/components/pack-art";
import { useMyPacks, type MyPack } from "@/lib/use-my-packs";

const status = "mt-4 text-sm leading-relaxed text-muted";
const open = cn(cleanButton.solid, "min-h-9 w-[92px] shrink-0 justify-center gap-1.5 px-3 text-sm");
const buy = "inline-flex min-h-9 w-[92px] shrink-0 items-center justify-center rounded-md border border-border text-sm transition-colors hover:border-black";
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Your unopened packs, one row per risk tier of the live edition, like the
 * trade watchlist. Concept editions can't be owned yet, so they get one line.
 */
export function CollectionEditions() {
  const { unopened, connected, refetch, loading, error } = useMyPacks();
  const demo = useDemo();
  const live = collectPacksLive && connected && !demo.active;
  const known = demo.active || live;
  // Connected, but packs aren't on sale on mainnet yet: nothing to check.
  const prelaunch = connected && !collectPacksLive && !demo.active;
  // Which tier's packs the reveal dialog is opening (demo opens oldest first).
  const [opening, setOpening] = useState<{ ready: MyPack[]; sealed: MyPack[] } | "demo" | null>(null);

  const rows = SHOWN_TIERS.map((tier) => {
    const packs = live ? unopened.filter((p) => p.tier === tier.id) : [];
    const ready = packs.filter((p) => p.ready).reverse(); // oldest first
    // Packs arrive sealed; the reveal dialog commits them (startOpen) first.
    const sealedPacks = packs.filter((p) => p.sealed);
    const owned = demo.active ? demo.packs.filter((t) => t === tier.id).length : packs.length;
    return { tier, ready, sealedPacks, owned };
  // One row per pack size; extra risk tiers (e.g. Fable · Medium) only when you hold some.
  }).filter((r) => EDITIONS.some((e) => e.tier === r.tier.id) || r.owned > 0);
  const total = rows.reduce((sum, r) => sum + r.owned, 0);
  // "Saga and Mythos", however many concept editions there are.
  const concepts = new Intl.ListFormat("en-US", { type: "conjunction" }).format(EDITIONS.filter((edition) => !edition.live && !edition.comingSoon).map((edition) => edition.name));

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="shelf-title" className="text-[22px] leading-[1.3] font-normal tracking-tight">Shelf</h2>
        <span className="text-base text-muted">[ {known ? `${pad(total)} unopened` : prelaunch ? "opening at launch" : "connect to check"} ]</span>
      </div>
      {live && loading && <p className={status} role="status">Loading your packs…</p>}
      {live && error && <p className={status} role="alert">Could not refresh your packs. <button type="button" className="text-black underline underline-offset-4" onClick={() => { void refetch(); }}>Retry</button></p>}

      <ul className="mt-4 grid gap-1.5 desk:mt-6">
        {rows.map(({ tier, ready, sealedPacks, owned }) => {
          const waiting = live && owned > 0 && ready.length === 0 && sealedPacks.length === 0;
          return (
            <li key={tier.id} className={cn("flex items-center gap-4 rounded-md border border-border px-4 py-3 transition-colors", owned > 0 ? "hover:border-black" : "")}>
              {/* This pack's real art, shrunk; faded when you hold none. */}
              <MiniPackArt edition={editionForTier(tier.id)} width={36} className={owned > 0 ? "" : "opacity-40"} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-base">{editionForTier(tier.id).name}</span>
                <span className="text-sm text-muted">{tier.level} risk</span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className={cn("text-xl tabular-nums", owned > 0 ? "text-black" : "text-muted")}>{!known ? "—" : live && loading ? "…" : owned}</span>
                {known && owned > 0 && <span className="text-sm text-muted">{waiting ? "sealing" : "ready"}</span>}
              </span>
              {!known ? null : owned > 0 ? (
                <button type="button" aria-haspopup="dialog" className={open} disabled={waiting} onClick={() => setOpening(demo.active ? "demo" : { ready, sealed: sealedPacks })}>
                  Open <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" />
                </button>
              ) : editionForTier(tier.id).comingSoon ? (
                <span className={cn(buy, "invisible")} aria-hidden="true">Buy</span>
              ) : (
                <Link href="/packs#play" className={buy}>Buy</Link>
              )}
            </li>
          );
        })}
      </ul>
      {!known && !prelaunch && <WalletEntry className={cn(cleanButton.solid, "mt-4 w-full justify-between")} />}
      {concepts && <p className={status}>{concepts} editions coming soon.</p>}

      {opening === "demo" && <DemoPackReveal onClose={() => setOpening(null)} />}
      {opening && opening !== "demo" && <LivePackReveal ready={opening.ready} sealed={opening.sealed} onClose={() => setOpening(null)} onOpened={refetch} />}
    </>
  );
}
