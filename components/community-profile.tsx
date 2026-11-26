"use client";

import { cardArt } from "@/lib/cards";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { CARD_ASPECT, clampCrop, cropStyle, NFT_ASPECT } from "@/components/card-avatar";
import { useQuery } from "@tanstack/react-query";
import { collectPacksAddress } from "@/lib/collect-packs";
import { cleanButton, cleanField, cn } from "@/components/clean-ui";
import { avatarsAbi, avatarsAddress, MAX_BIO, namesAbi, namesAddress } from "@/lib/contracts";
import { txErrorMessage } from "@/lib/tx-error";
import type { CardAvatarCrop } from "@/lib/use-avatars";
import { NAME_PATTERN } from "@/lib/use-names";

/**
 * Profile editing for the community profile dialog: username (CollectNames),
 * a picture cropped from a card you own and a bio (CollectProfiles). Styled
 * with the same tokens as the community page.
 */
const sectionLabel = "mt-6 text-sm text-muted";
const note = "mt-2 text-sm text-muted";

/** Claim or change your on-chain username. */
export function UsernameForm({ current, onSaved }: { current?: string; onSaved: () => void }) {
  const [value, setValue] = useState(current ?? "");
  const valid = NAME_PATTERN.test(value);
  const unchanged = value === (current ?? "");
  const { data: holder, isFetching } = useReadContract({
    address: namesAddress,
    abi: namesAbi,
    functionName: "ownerOf",
    args: [value],
    query: { enabled: valid && !unchanged },
  });
  const { address } = useAccount();
  // Held by someone else; our own name (e.g. just saved) doesn't count.
  const taken = holder !== undefined && !/^0x0{40}$/i.test(holder) && holder.toLowerCase() !== address?.toLowerCase();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const busy = isPending || receipt.isLoading;

  useEffect(() => {
    if (receipt.isSuccess) onSaved();
    // Only react to a newly confirmed name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const hint = !value ? "3–16 characters: a–z, 0–9, _" : !valid ? "Use 3–16 lowercase letters, numbers or _" : unchanged ? "This is your username." : isFetching ? "Checking…" : taken ? "Taken. Try another." : "Available.";

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valid && !taken && !unchanged) { reset(); writeContract({ address: namesAddress, abi: namesAbi, functionName: "setName", args: [value] }); } }}>
      <label htmlFor="username" className={cn(sectionLabel, "block")}>Username</label>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-muted" aria-hidden="true">@</span>
        <input id="username" className={cleanField} value={value} maxLength={16} autoComplete="off" spellCheck={false} placeholder="yourname" onChange={(e) => { reset(); setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); }} />
        <button type="submit" className={cn(cleanButton.solid, "h-11 min-h-11 shrink-0")} disabled={busy || !valid || taken || unchanged || isFetching}>{isPending ? "Confirm…" : receipt.isLoading ? "Saving…" : current ? "Change" : "Claim"}</button>
      </div>
      <p aria-live="polite" className={cn(note, taken || error ? "text-down" : valid && !unchanged && !isFetching ? "text-up" : "")}>
        {error ? txErrorMessage(error) : receipt.isSuccess ? "Saved on-chain." : hint}
      </p>
    </form>
  );
}

/** The profile's bio, editable by its owner. */
export function Bio({ account, isMe }: { account: `0x${string}`; isMe: boolean }) {
  const { data: bio, refetch } = useReadContract({ address: avatarsAddress, abi: avatarsAbi, functionName: "bioOf", args: [account] });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (receipt.isSuccess) void refetch();
    // Only react to a newly confirmed bio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);
  const size = new TextEncoder().encode(value).length;
  const busy = isPending || receipt.isLoading;

  // A confirmed save closes the editor; reopening resets the transaction.
  if (!editing || receipt.isSuccess) {
    return (
      <>
        {bio ? <p className="mt-4 text-[15px] leading-relaxed">{bio}</p> : null}
        {isMe && <button type="button" className="mt-2 text-sm text-muted underline underline-offset-4 hover:text-black" onClick={() => { reset(); setValue(bio ?? ""); setEditing(true); }}>{bio ? "Edit bio" : "Add a bio"}</button>}
      </>
    );
  }
  return (
    <form className="mt-4" onSubmit={(e) => { e.preventDefault(); writeContract({ address: avatarsAddress, abi: avatarsAbi, functionName: "setBio", args: [value.trim()] }); }}>
      <label className="flex flex-col gap-2 text-sm text-muted">
        <span>Bio <span className="tabular-nums">{size}/{MAX_BIO}</span></span>
        <textarea rows={2} className={cn(cleanField, "text-black")} value={value} disabled={busy} onChange={(e) => setValue(e.target.value)} />
      </label>
      <div className="mt-3 flex gap-2">
        <button type="submit" className={cleanButton.solid} disabled={busy || size > MAX_BIO}>{isPending ? "Confirm in wallet…" : receipt.isLoading ? "Saving…" : "Save bio"}</button>
        <button type="button" className={cleanButton.outline} disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      </div>
      {error && <p className={cn(note, "text-down")} role="alert">{txErrorMessage(error)}</p>}
    </form>
  );
}

type NftOption = { nft: string; tokenId: string; collection: string; name: string | null; image: string | null };
type Source = { kind: "card"; id: bigint; ticker: string } | { kind: "nft"; nft: string; tokenId: bigint; image: string; label: string };

/** Pick a Grailio card or any BNB Chain NFT you own and crop it into your profile picture. */
export function AvatarEditor({ cards, current, onSaved, onLocalSave, onLocalClear, onChange, onClear, nfts: allowNfts = true }: {
  cards: { id: bigint; ticker: string; rarity: number; tier: number }[];
  current?: CardAvatarCrop;
  onSaved: () => void;
  /** Demo mode: save the card pick locally instead of on-chain. */
  onLocalSave?: (pick: { ticker: string; rarity?: number; tier?: number; x: number; y: number; zoom: number }) => void;
  onLocalClear?: () => void;
  /**
   * Embedded in a form: always open, no buttons of its own; reports the card
   * and framing as the user picks, drags or zooms (the form saves it).
   */
  onChange?: (pick: { id: bigint; ticker: string; rarity?: number; tier?: number; x: number; y: number; zoom: number }) => void;
  /** Embedded only: clicking the selected card again unselects it and clears the picture. */
  onClear?: () => void;
  /** Show the "Your NFTs" tab (needs a real wallet). */
  nfts?: boolean;
}) {
  const embedded = Boolean(onChange);
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"cards" | "nfts">(current?.image ? "nfts" : "cards");
  const firstCard = cards[0];
  const [source, setSource] = useState<Source | null>(
    current?.image && current.nft
      ? { kind: "nft", nft: current.nft, tokenId: current.tokenId, image: current.image, label: current.label ?? "NFT" }
      : current?.ticker ? { kind: "card", id: current.tokenId, ticker: current.ticker } : firstCard && !embedded ? { kind: "card", id: firstCard.id, ticker: firstCard.ticker } : null,
  );
  const aspect = source?.kind === "nft" ? NFT_ASPECT : CARD_ASPECT;
  const [crop, setCrop] = useState(() => clampCrop(current?.x ?? 5000, current?.y ?? 3000, current?.zoom ?? 200, current?.image ? NFT_ASPECT : CARD_ASPECT));
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  // Embedded: report only after the user touches the picker, so opening the form changes nothing.
  const touched = useRef(false);
  const frame = useRef<HTMLDivElement>(null);
  const selectedCard = source?.kind === "card" ? cards.find((c) => c.id === source.id) : undefined;
  const art = source?.kind === "card" ? cardArt(source.ticker, selectedCard?.rarity ?? current?.rarity ?? 0, selectedCard?.tier ?? current?.tier) : undefined;
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const busy = isPending || receipt.isLoading;

  // The wallet's other BNB Chain NFTs (Grailio cards are on the first tab).
  const nfts = useQuery({
    queryKey: ["my-nfts", address?.toLowerCase()],
    enabled: open && tab === "nfts" && Boolean(address),
    staleTime: 60_000,
    queryFn: async (): Promise<NftOption[]> => {
      const res = await fetch(`/api/nfts?owner=${address}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't load your NFTs");
      return (json.items as NftOption[]).filter((n) => n.image && n.nft.toLowerCase() !== collectPacksAddress.toLowerCase());
    },
  });

  useEffect(() => {
    if (!embedded || !touched.current || source?.kind !== "card") return;
    onChange?.({ id: source.id, ticker: source.ticker, rarity: selectedCard?.rarity, tier: selectedCard?.tier, x: crop.x, y: crop.y, zoom: crop.zoom });
    // Report picks and framing as they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, crop]);

  useEffect(() => {
    if (!receipt.isSuccess) return;
    onSaved();
    // Only react to a newly confirmed avatar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  if (!embedded && (!open || receipt.isSuccess)) {
    return (
      <button type="button" className={cn(cleanButton.outline, "mt-6 w-full justify-between")} onClick={() => { reset(); setOpen(true); }}>
        {current ? "Change profile picture" : allowNfts ? "Set a profile picture from your cards or NFTs" : "Set a profile picture from your cards"} <ArrowUpRightIcon weight="bold" />
      </button>
    );
  }

  function pick(next: Source) {
    touched.current = true;
    setSource(next);
    setCrop((c) => clampCrop(5000, next.kind === "nft" ? 5000 : 3000, c.zoom, next.kind === "nft" ? NFT_ASPECT : CARD_ASPECT));
  }
  // Dragging moves the image: convert pixels to focus basis points at this zoom.
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const size = frame.current?.clientWidth;
    if (!d || !size) return;
    const w = (size * crop.zoom) / 100;
    const h = w * aspect;
    setCrop(clampCrop(d.x - ((e.clientX - d.px) / w) * 10_000, d.y - ((e.clientY - d.py) / h) * 10_000, crop.zoom, aspect));
  }
  function nudge(dx: number, dy: number) {
    setCrop((c) => clampCrop(c.x + dx, c.y + dy, c.zoom, aspect));
  }
  function save() {
    if (!source) return;
    if (onLocalSave) {
      if (source.kind === "card") onLocalSave({ ticker: source.ticker, rarity: selectedCard?.rarity, tier: selectedCard?.tier, x: crop.x, y: crop.y, zoom: crop.zoom });
      setOpen(false);
      return;
    }
    reset();
    if (source.kind === "card") writeContract({ address: avatarsAddress, abi: avatarsAbi, functionName: "setAvatar", args: [source.id, crop.x, crop.y, crop.zoom] });
    else writeContract({ address: avatarsAddress, abi: avatarsAbi, functionName: "setNftAvatar", args: [source.nft as `0x${string}`, source.tokenId, crop.x, crop.y, crop.zoom] });
  }
  const tabButton = "rounded-md border border-border px-3 py-1.5 text-sm aria-pressed:border-black";

  const previewFrame = (
    <div
      ref={frame}
      className={cn("relative cursor-grab", embedded ? "size-24" : "size-[180px]", " touch-none overflow-hidden rounded-full bg-surface-muted ring-1 ring-border active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black [&_img]:pointer-events-none [&_img]:select-none")}
      role="application"
      aria-label="Drag to position your picture. Arrow keys also move it."
      tabIndex={0}
      onPointerDown={(e) => { touched.current = true; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y }; }}
      onPointerMove={onPointerMove}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(e) => {
        touched.current = true;
        const step = 150;
        if (e.key === "ArrowLeft") nudge(-step, 0);
        else if (e.key === "ArrowRight") nudge(step, 0);
        else if (e.key === "ArrowUp") nudge(0, -step);
        else if (e.key === "ArrowDown") nudge(0, step);
        else return;
        e.preventDefault();
      }}
    >
      {source?.kind === "nft" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source.image} alt="" referrerPolicy="no-referrer" style={cropStyle(crop.x, crop.y, crop.zoom, NFT_ASPECT)} draggable={false} />
      ) : art ? (
        <Image src={art.src} alt="" width={1024} height={1536} sizes="600px" style={cropStyle(crop.x, crop.y, crop.zoom)} draggable={false} priority />
      ) : null}
    </div>
  );
  const zoomControl = (
    <label className="flex w-full max-w-[240px] items-center gap-2.5 text-sm text-muted">
      <span>Zoom</span>
      <input type="range" className="flex-1 accent-black" min={100} max={400} step={5} value={crop.zoom} onChange={(e) => { touched.current = true; setCrop((c) => clampCrop(c.x, c.y, Number(e.target.value), aspect)); }} />
    </label>
  );
  const cardList = (
    <ul className="mt-2 flex list-none gap-2 overflow-x-auto p-0.5" role="listbox" aria-label="Choose a card">
      {cards.map((c) => {
        const a = cardArt(c.ticker, c.rarity, c.tier);
        if (!a) return null;
        const selected = source?.kind === "card" && source.id === c.id;
        return (
          <li key={String(c.id)}>
            <button type="button" role="option" aria-selected={selected} aria-label={`${a.name} #${String(c.id)}`} className="block w-[52px] overflow-hidden rounded-md border-2 border-transparent aria-selected:border-black" onClick={() => { if (selected && onClear) { setSource(null); onClear(); } else pick({ kind: "card", id: c.id, ticker: c.ticker }); }}>
              <Image src={a.src} alt="" width={1024} height={1536} sizes="60px" className="block h-auto w-full" />
            </button>
          </li>
        );
      })}
    </ul>
  );

  const hasPreview = Boolean(source && (art || source.kind === "nft"));
  // In a form (the profile drawer): the preview with zoom and the form's own controls beside it, the cards below.
  if (embedded) {
    return (
      <section aria-label="Profile picture" className="flex flex-col gap-4">
        <div className="flex items-center gap-5">
          {hasPreview ? previewFrame : <span className="grid size-24 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-sm text-muted">None</span>}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
            {hasPreview && zoomControl}
          </div>
        </div>
        {cards.length > 0 && cardList}
      </section>
    );
  }

  return (
    <section aria-label="Profile picture">
      {!embedded && <h3 className={sectionLabel}>Profile picture</h3>}
      {allowNfts && (
        <div className="mt-2 flex gap-1.5" role="group" aria-label="Picture source">
          <button type="button" className={tabButton} aria-pressed={tab === "cards"} onClick={() => setTab("cards")}>Grailio cards</button>
          <button type="button" className={tabButton} aria-pressed={tab === "nfts"} onClick={() => setTab("nfts")}>Your NFTs</button>
        </div>
      )}

      {tab === "cards" || !allowNfts ? (
        cards.length === 0 ? <p className={note}>Open a pack to get a card you can use.</p> : cardList
      ) : nfts.isLoading ? <p className={note}>Loading your NFTs…</p> : nfts.error ? <p className={cn(note, "text-down")}>{(nfts.error as Error).message}</p> : !nfts.data?.length ? (
        <p className={note}>No other NFTs with images found in this wallet on BNB Chain.</p>
      ) : (
        <ul className="mt-2 flex list-none gap-2 overflow-x-auto p-0.5" role="listbox" aria-label="Choose an NFT">
          {nfts.data.map((n) => {
            const selected = source?.kind === "nft" && source.nft.toLowerCase() === n.nft.toLowerCase() && source.tokenId === BigInt(n.tokenId);
            const label = n.name ?? `${n.collection} #${n.tokenId}`;
            return (
              <li key={`${n.nft}-${n.tokenId}`}>
                <button type="button" role="option" aria-selected={selected} aria-label={label} title={label} className="block size-[52px] overflow-hidden rounded-md border-2 border-transparent aria-selected:border-black" onClick={() => pick({ kind: "nft", nft: n.nft, tokenId: BigInt(n.tokenId), image: n.image!, label })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={n.image!} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasPreview && (
        <div className={cn("flex flex-col items-center", embedded ? "mt-2 gap-2" : "mt-3 gap-3")}>
          {previewFrame}
          {zoomControl}
          {!embedded && <p className="text-sm text-muted">Drag the picture to frame it.</p>}
        </div>
      )}

      {!embedded && <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={cleanButton.solid} disabled={busy || !source} onClick={save}>
          {isPending ? "Confirm in wallet…" : receipt.isLoading ? "Saving…" : "Save picture"} <ArrowUpRightIcon weight="bold" />
        </button>
        {current && (
          <button type="button" className={cleanButton.outline} disabled={busy} onClick={() => { if (onLocalClear) { onLocalClear(); setOpen(false); return; } reset(); writeContract({ address: avatarsAddress, abi: avatarsAbi, functionName: "clearAvatar" }); }}>Remove</button>
        )}
        <button type="button" className="text-sm text-muted underline underline-offset-4 hover:text-black" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>}
      {error && <p className={cn(note, "text-down")} role="alert">{txErrorMessage(error)}</p>}
    </section>
  );
}
