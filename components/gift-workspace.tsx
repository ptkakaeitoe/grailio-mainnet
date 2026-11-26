"use client";

import { useWalletAuth } from "@/lib/wallet-auth";
import { revealFrame } from "@/components/pack-reveal-art";
import { ClaimedPackReveal } from "@/components/claimed-pack-reveal";
import { parseEther } from "viem";
import { GIFT_GAS_THRESHOLD, requestGiftGas } from "@/lib/gift-gas";
import { useConnectWallet } from "@/components/beta-access";
import { EyeIcon, EyeSlashIcon, GiftIcon, XIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";

import { cleanButton, cleanDialog, cleanField, cn, dialogClose, dialogFooter, dialogHeader, dialogLabel } from "@/components/clean-ui";
import { useDemo } from "@/components/demo-provider";
import { GiftShareActions } from "@/components/gift-code";
import { MiniPackArt } from "@/components/pack-art";
import { collectPacksAbi, collectPacksAddress, collectPacksLive } from "@/lib/collect-packs";
import { PACK_TIERS } from "@/lib/contracts";
import { editionForTier } from "@/lib/editions";
import { giftAccount, parseCode } from "@/lib/gift-code";
import { useClaimGift, useSentGifts, type GiftStatus } from "@/lib/use-gifts";

// A shared link carries the code after "#": read it without a server round trip.
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = () => decodeURIComponent(window.location.hash.slice(1));

// Signing in with Google can leave the page and come back without the "#CODE".
// The code is kept for this tab during sign-in and put back on return.
const PENDING_GIFT = "grailio-pending-gift";
function rememberGift(code: string) {
  try { sessionStorage.setItem(PENDING_GIFT, code); } catch { /* storage blocked */ }
}
function takePendingGift(): string | null {
  try {
    const code = sessionStorage.getItem(PENDING_GIFT);
    sessionStorage.removeItem(PENDING_GIFT);
    return code;
  } catch {
    return null;
  }
}

const packsLabel = (tier: number, quantity: number) => {
  const name = PACK_TIERS.find((t) => t.id === tier)?.name ?? "Pack";
  return quantity === 1 ? `${name} pack` : `${quantity} ${name} packs`;
};
const STATUS: Record<GiftStatus, string> = { pending: "Confirming…", open: "Waiting to be claimed", claimed: "Claimed", cancelled: "Cancelled · packs returned" };

/** The claim form in a pop-up: enter a code, claim. */
/** `onSignIn`: the pop-up steps aside for sign-in; the parent reopens it once the wallet connects. */
export function GiftClaimDialog({ onClose, onSignIn, onOpenPacks }: { onClose: () => void; onSignIn?: () => void; onOpenPacks: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  // A centred dialog, only as tall as the form; unmount after its close animation (.pop-dialog in globals.css).
  function dismiss() {
    dialog.current?.close();
    window.setTimeout(onClose, 360);
  }
  return (
    <dialog
      ref={dialog}
      className={cn(cleanDialog, "w-[min(420px,calc(100vw-32px))]")}
      aria-labelledby="claim-gift-title"
      onCancel={(e) => { e.preventDefault(); dismiss(); }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <header className={revealFrame.header}>
        <h2 id="claim-gift-title" className={revealFrame.label}>[ claim a gift ]</h2>
        <button type="button" className={dialogClose} aria-label="Close" onClick={dismiss}><XIcon className="size-[18px]" /></button>
      </header>
      <ClaimForm onSignIn={onSignIn} onClose={onClose} onOpenPacks={onOpenPacks} />
    </dialog>
  );
}

/**
 * The claim pop-up steps aside while the sign-in window is open. It comes back
 * once a wallet connects, and also if sign-in is closed without finishing (or
 * never opens), so the gift isn't lost behind a dismissed window.
 */
function useSignInStepAside() {
  const { isConnected } = useAccount();
  const { modalOpen } = useWalletAuth();
  const [waiting, setWaiting] = useState(false);
  const [seen, setSeen] = useState(false); // the sign-in window has opened since "Sign in"
  const [stuck, setStuck] = useState(false); // it never opened
  if (waiting && modalOpen && !seen) setSeen(true);
  useEffect(() => {
    if (!waiting || seen) return;
    const timer = setTimeout(() => setStuck(true), 5_000);
    return () => clearTimeout(timer);
  }, [waiting, seen]);
  const back = isConnected || (seen && !modalOpen) || stuck;
  return {
    waiting,
    back,
    start: () => { setWaiting(true); setSeen(false); setStuck(false); },
    stop: () => { setWaiting(false); setSeen(false); setStuck(false); },
  };
}

/** "Have a gift code? Claim it": opens the claim pop-up in place. */
export function GiftClaimLink({ className, variant = "inline", children }: {
  className?: string;
  /** "button": just a button styled by `className`, labelled by `children` (the collection's Gifts section). */
  variant?: "inline" | "button";
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const signIn = useSignInStepAside();
  const shown = signIn.waiting ? signIn.back : open;
  const [revealing, setRevealing] = useState(false);
  return (
    <>
      {variant === "button" ? (
        <button type="button" aria-haspopup="dialog" className={className} onClick={() => setOpen(true)}>{children ?? "Redeem a code"}</button>
      ) : (
        <p className={cn("flex items-center gap-2 text-base text-muted", className)}>
          <GiftIcon size={18} className="shrink-0" aria-hidden="true" />
          <span>Have a gift code?{" "}
          <button type="button" aria-haspopup="dialog" className="text-black underline underline-offset-4" onClick={() => setOpen(true)}>Claim it</button></span>
        </p>
      )}
      {shown && <GiftClaimDialog onClose={() => { setOpen(false); signIn.stop(); }} onSignIn={signIn.start} onOpenPacks={() => { setOpen(false); signIn.stop(); setRevealing(true); }} />}
      {revealing && <ClaimedPackReveal onClose={() => setRevealing(false)} />}
    </>
  );
}

/**
 * A shared gift link (/collection#CODE) opens the claim pop-up with the code
 * filled in. Closing it clears the code from the address bar.
 */
export function GiftFromLink() {
  const fromLink = useSyncExternalStore(subscribeHash, readHash, () => "");
  const [dismissed, setDismissed] = useState(false);
  const signIn = useSignInStepAside();
  // Back from a sign-in that dropped the code: put it back in the address.
  useEffect(() => {
    const pending = takePendingGift();
    if (pending && !parseCode(readHash())) window.location.hash = pending;
  }, []);
  // Only real gift codes open it (not other "#" links such as /packs#play).
  const shown = signIn.waiting ? signIn.back : !dismissed && Boolean(fromLink) && parseCode(fromLink) !== null;
  const [revealing, setRevealing] = useState(false);
  const close = () => {
    setDismissed(true);
    signIn.stop();
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  };
  return (
    <>
      {shown && <GiftClaimDialog onClose={close} onSignIn={signIn.start} onOpenPacks={() => { close(); setRevealing(true); }} />}
      {revealing && <ClaimedPackReveal onClose={() => setRevealing(false)} />}
    </>
  );
}

function ClaimForm({ onSignIn, onClose, onOpenPacks }: { onSignIn?: () => void; onClose: () => void; onOpenPacks: () => void }) {
  const demo = useDemo();
  const { isConnected } = useAccount();
  // Privy may still be loading or re-attaching a signed-in wallet: wait instead of asking to sign in.
  const { restoring: authLoading } = useWalletAuth();
  // If sign-in never finishes loading (blocked, offline), offer "Sign in" after 30s anyway.
  const [authSlow, setAuthSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAuthSlow(true), 30_000);
    return () => clearTimeout(timer);
  }, []);
  const restoring = authLoading && !authSlow;
  // Signed in here without leaving the page: the saved code isn't needed any more.
  useEffect(() => { if (isConnected) takePendingGift(); }, [isConnected]);
  const live = useClaimGift();
  const fromLink = useSyncExternalStore(subscribeHash, readHash, () => "");
  const [typed, setTyped] = useState<string | null>(null);
  const [demoResult, setDemoResult] = useState<{ ok: boolean; text: string } | null>(null);
  const value = typed ?? fromLink;
  const parsed = value.trim() ? parseCode(value) : null;
  const { unlocked, openConnect, unlockWithGift } = useConnectWallet();
  // A live code's gift, read from the chain: which packs, and whether it's still open.
  const signer = parsed?.kind === "live" ? giftAccount(parsed.secret).address : undefined;
  const { data: giftId } = useReadContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "giftIdOf", args: signer ? [signer] : undefined, query: { enabled: Boolean(signer) && collectPacksLive } });
  const { data: giftRow } = useReadContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "gifts", args: giftId ? [giftId] : undefined, query: { enabled: Boolean(giftId) } });
  const liveGift = giftRow ? (() => { const [, , tier, quantity, done] = giftRow as readonly [string, string, number, number, boolean, bigint]; return { tier: Number(tier), quantity: Number(quantity), done }; })() : null;
  const [signingIn, setSigningIn] = useState(false);
  const { address } = useAccount();
  const client = usePublicClient();
  // New wallets have no BNB: the relayer adds a little before the claim (app/api/gift/gas).
  const [gasStep, setGasStep] = useState<"idle" | "adding" | "failed">("idle");
  const [gasError, setGasError] = useState<string | null>(null);

  async function ensureGas(secret: string): Promise<boolean> {
    if (!client || !address) return true;
    const balance = await client.getBalance({ address });
    if (balance >= parseEther(GIFT_GAS_THRESHOLD)) return true;
    setGasStep("adding");
    setGasError(null);
    try {
      await requestGiftGas(secret, address);
      // The relayer waits for its transfer, but this wallet's RPC can be a block behind.
      for (let i = 0; i < 10 && (await client.getBalance({ address })) < parseEther(GIFT_GAS_THRESHOLD); i++) {
        await new Promise((r) => setTimeout(r, 1_000));
      }
      setGasStep("idle");
      return true;
    } catch (e) {
      setGasStep("failed");
      setGasError(e instanceof Error ? e.message : "Couldn't add gas.");
      return false;
    }
  }

  /** Sign in for this gift: the pop-up steps aside; a valid gift link skips the beta code. */
  async function signInToClaim() {
    if (!parsed || parsed.kind !== "live") return;
    setSigningIn(true);
    rememberGift(value.trim());
    onSignIn?.();
    const skipped = unlocked === true ? false : await unlockWithGift(parsed.secret);
    if (!skipped) openConnect();
    setSigningIn(false);
  }

  function submit() {
    setDemoResult(null);
    if (!parsed) return;
    if (parsed.kind === "demo") {
      if (!PACK_TIERS.some((t) => t.id === parsed.tier)) { setDemoResult({ ok: false, text: "That’s not a valid gift code." }); return; }
      const code = value.trim().toUpperCase();
      const ok = demo.claimGift(code, parsed.tier, parsed.quantity);
      setDemoResult(ok ? { ok: true, text: `${packsLabel(parsed.tier, parsed.quantity)} added to your demo collection.` } : { ok: false, text: "This demo gift was already claimed in this browser." });
      return;
    }
    const secret = parsed.secret;
    void (async () => {
      if (await ensureGas(secret)) void live.claim(secret);
    })();
  }

  // What claiming this code needs, if it can't be claimed here yet.
  const blocker = !parsed ? null
    : parsed.kind === "demo" && !demo.active ? <>This is a demo gift. <button type="button" className="text-black underline underline-offset-4" onClick={demo.start}>Try the demo</button> to claim it.</>
    : parsed.kind === "live" && demo.active ? "This is a real gift. Exit demo mode and connect your wallet to claim it."
    : parsed.kind === "live" && !collectPacksLive ? "Real gifts open when packs launch on BNB Chain."
    : null;
  const needsWallet = parsed?.kind === "live" && !demo.active && collectPacksLive && !isConnected;
  const done = demoResult?.ok || live.done;

  // What the gift holds (demo codes say it; live ones are read from the chain).
  const info = parsed?.kind === "demo" ? { tier: parsed.tier, quantity: parsed.quantity } : live.done ?? (liveGift ? { tier: liveGift.tier, quantity: liveGift.quantity } : null);
  const used = parsed?.kind === "live" && liveGift?.done === true && !live.done;
  // Same stage and pack size as the reveal, so Open now doesn't change the pop-up's size.
  const hero = (faded = false) => info && (
    <div className={revealFrame.stage} aria-hidden="true">
      <MiniPackArt edition={editionForTier(info.tier)} width={180} className={cn("rounded-[4px] drop-shadow-[0_12px_12px_#00000033]", faded && "opacity-40 grayscale")} />
    </div>
  );

  // Claimed: open it right here, or later.
  if (done && info) {
    return (
      <>
        {hero()}
        <div className={revealFrame.body}>
        <div role="status">
          <h3 className={revealFrame.title}>It’s yours.</h3>
          <p className={revealFrame.note}>{packsLabel(info.tier, info.quantity)} added to your {demoResult?.ok ? "demo " : ""}collection.</p>
        </div>
        </div>
        <div className={cn(dialogFooter, "grid grid-cols-2 gap-2")}>
          <button type="button" className={cn(cleanButton.outline, "h-11 justify-center")} onClick={onClose}>Later</button>
          <button type="button" className={cn(cleanButton.solid, "h-11 justify-center")} onClick={onOpenPacks}>Open now</button>
        </div>
      </>
    );
  }

  // A link whose gift was already claimed (or cancelled): say so and point to your packs.
  if (used && info) {
    return (
      <>
        {hero(true)}
        <div className={revealFrame.body}>
          <h3 className={revealFrame.title}>Already claimed.</h3>
          <p className={revealFrame.note}>This {packsLabel(info.tier, info.quantity)} gift has been claimed or cancelled.</p>
        </div>
        <div className={cn(dialogFooter, "grid grid-cols-2 gap-2")}>
          <button type="button" className={cn(cleanButton.outline, "h-11 justify-center")} onClick={onClose}>Close</button>
          <Link href="/collection" className={cn(cleanButton.solid, "h-11 justify-center")} onClick={onClose}>Your packs</Link>
        </div>
      </>
    );
  }

  return (
    // `contents`: the form's parts sit straight in the dialog's column, so the claim button can pin to the bottom.
    <form className="contents" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {hero()}
      <div className={cn(revealFrame.body, "flex flex-col gap-4")}>
      {info && (
        <div>
          <h3 className={revealFrame.title}>{packsLabel(info.tier, info.quantity)}</h3>
          <p className={revealFrame.note}>{parsed?.kind === "demo" ? "Demo gift" : "A gift for you"}</p>
        </div>
      )}
      {!(info && fromLink && typed === null) && <label className="flex flex-col gap-1.5 text-sm text-muted">
        <span>Gift code</span>
        <input autoFocus={!info} className={cn(cleanField, "font-mono tracking-wide uppercase")} value={value} autoComplete="off" spellCheck={false} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" onChange={(e) => { setTyped(e.target.value); setDemoResult(null); }} />
      </label>}
      {value.trim() && !parsed && <p className="text-sm text-down" role="alert">That doesn’t look like a gift code.</p>}
      {parsed && !info && <p className="text-sm text-muted">{giftId === 0n ? "No gift found for this code." : "Looking up this gift…"}</p>}
      {gasError && <p className="text-sm break-words text-down" role="alert">{gasError}</p>}
      {(demoResult && !demoResult.ok) || live.error ? <p className="text-sm break-words text-down" role="alert">{demoResult?.ok === false ? demoResult.text : live.error}</p> : null}
      {blocker && <p className="text-sm text-muted" role="status">{blocker}</p>}
      </div>
      <div className={cn(dialogFooter, "flex flex-col")}>
        {blocker ? null : needsWallet && restoring ? (
          <button type="button" className={cn(cleanButton.solid, "h-11 justify-center")} disabled>Checking sign-in…</button>
        ) : needsWallet ? (
          <button type="button" className={cn(cleanButton.solid, "h-11 justify-center")} disabled={signingIn || giftId === 0n} onClick={() => { void signInToClaim(); }}>
            {signingIn ? "Opening sign-in…" : "Sign in to claim"}
          </button>
        ) : (
          <button type="submit" className={cn(cleanButton.solid, "h-11 justify-center")} disabled={!parsed || live.busy || gasStep === "adding" || Boolean(done)}>
            {gasStep === "adding" ? "Adding gas for you…" : live.busy ? "Claiming… confirm in your wallet" : "Claim"}
          </button>
        )}
      </div>
    </form>
  );
}

/** One gift: pack, name and status; open gifts have Details (code hidden until you show it). */
function SentRow({ code, tier, quantity, status, onCancel, busy }: { code: string; tier: number; quantity: number; status: GiftStatus; onCancel: () => void; busy?: boolean }) {
  const [details, setDetails] = useState(false);
  return (
    <li className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
      <MiniPackArt edition={editionForTier(tier)} width={28} className={status === "open" || status === "pending" ? "" : "opacity-40"} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base">{packsLabel(tier, quantity)}</span>
        <span className={cn("text-sm", status === "claimed" ? "text-up" : "text-muted")}>{STATUS[status]}</span>
      </span>
      {status === "open" && (
        <button type="button" aria-haspopup="dialog" className="min-h-9 shrink-0 rounded-md border border-border px-3 text-sm transition-colors hover:border-black" onClick={() => setDetails(true)}>Details</button>
      )}
      {details && <GiftDetailsDialog code={code} tier={tier} quantity={quantity} busy={busy} onCancelGift={() => { setDetails(false); onCancel(); }} onClose={() => setDetails(false)} />}
    </li>
  );
}

/** A gift's code (hidden until you show it), share actions and Cancel. */
function GiftDetailsDialog({ code, tier, quantity, busy, onCancelGift, onClose }: { code: string; tier: number; quantity: number; busy?: boolean; onCancelGift: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState(false);
  // Cancel gift asks here first (no browser confirm box).
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog
      ref={dialog}
      className={cn(cleanDialog, "w-[min(420px,calc(100%-32px))]")}
      aria-labelledby="gift-details-title"
      onCancel={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <header className={dialogHeader}>
        <span className={dialogLabel}>[ {confirming ? "cancel gift" : "gift"} ]</span>
        <button type="button" className={dialogClose} aria-label="Close" onClick={onClose}><XIcon className="size-[18px]" /></button>
      </header>
      {confirming ? (
        <>
          <div className="flex items-center gap-3 p-5">
            <MiniPackArt edition={editionForTier(tier)} width={40} />
            <div>
              <h2 id="gift-details-title" className="text-xl font-normal">Cancel this gift?</h2>
              <p className="text-sm text-muted">The packs come back to you and the code stops working.</p>
            </div>
          </div>
          <div className={cn(dialogFooter, "grid grid-cols-2 gap-2")}>
            <button type="button" className={cn(cleanButton.outline, "h-11 justify-center")} onClick={() => setConfirming(false)}>Keep gift</button>
            <button type="button" className={cn(cleanButton.solid, "h-11 justify-center")} disabled={busy} onClick={onCancelGift}>Cancel gift</button>
          </div>
        </>
      ) : (
        <>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <MiniPackArt edition={editionForTier(tier)} width={40} />
            <div>
              <h2 id="gift-details-title" className="text-xl font-normal">{packsLabel(tier, quantity)}</h2>
              <p className="text-sm text-muted">{STATUS.open}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-muted px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-sm tracking-wide" aria-label={shown ? "Gift code" : "Gift code, hidden"}>
              {shown ? code : code.replace(/[0-9A-Z]/g, "•")}
            </span>
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:text-black" aria-label={shown ? "Hide code" : "Show code"} aria-pressed={shown} onClick={() => setShown(!shown)}>
              {shown ? <EyeSlashIcon size={18} /> : <EyeIcon size={18} />}
            </button>
          </div>
        </div>
        <div className={cn(dialogFooter, "flex flex-col gap-3")}>
          <GiftShareActions code={code} tier={tier} quantity={quantity} />
          <button type="button" className="self-center text-sm text-muted underline-offset-4 hover:text-black hover:underline disabled:opacity-40" disabled={busy} onClick={() => setConfirming(true)}>Cancel gift</button>
        </div>
        </>
      )}
    </dialog>
  );
}

/** The gifts you've bought: status, and for open ones the code to share or cancel. */
export type SentGiftsSlots = {
  /** Replaces "No gifts yet." */
  empty?: ReactNode;
  /** Replaces the connect-your-wallet line. */
  signedOut?: ReactNode;
  /** Shown under the list when there are gifts. */
  footer?: ReactNode;
};

export function SentGifts(slots: SentGiftsSlots) {
  const demo = useDemo();
  return demo.active ? <DemoSent {...slots} /> : <LiveSent {...slots} />;
}

const emptySent = <p className="text-sm text-muted">No gifts yet.</p>;

function DemoSent({ empty = emptySent, footer }: SentGiftsSlots) {
  const demo = useDemo();
  if (demo.gifts.length === 0) return empty;
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {demo.gifts.map((g) => (
          <SentRow key={g.code} code={g.code} tier={g.tier} quantity={g.quantity} status={g.status} onCancel={() => { demo.cancelGift(g.code); }} />
        ))}
      </ul>
      {footer}
    </>
  );
}

function LiveSent({ empty = emptySent, signedOut, footer }: SentGiftsSlots) {
  const { isConnected } = useAccount();
  const { gifts, cancel, cancelling } = useSentGifts();
  if (!isConnected) return signedOut ?? <p className="text-sm text-muted">Connect your wallet to see gifts you’ve sent from this browser.</p>;
  if (gifts.length === 0) return empty;
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {gifts.map((g) => (
          <SentRow key={g.code} code={g.code} tier={g.tier} quantity={g.quantity} status={g.status} busy={cancelling} onCancel={() => { void cancel(g.code).catch(() => {}); }} />
        ))}
      </ul>
      <p className="mt-4 text-[13px] text-muted">Codes are kept only in this browser. Copy them somewhere safe.</p>
      {footer}
    </>
  );
}
