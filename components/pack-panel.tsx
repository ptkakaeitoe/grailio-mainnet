"use client";

import { useTierUsage } from "@/lib/use-tier-usage";
import { packsLeft, RISKY_MAX_PER_BUY, TIER_BUDGETS } from "@/lib/tier-budget";
import { tokenAmount } from "@/lib/format-amount";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon, CaretDownIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { DemoPackReveal } from "@/components/demo-pack-reveal";
import { GiftCodeDialog } from "@/components/gift-code";
import { PackConfirmDialog } from "@/components/pack-confirm-dialog";
import { GiftClaimLink, GiftFromLink } from "@/components/gift-workspace";
import { useConnectWallet } from "@/components/beta-access";
import { newLiveCode } from "@/lib/gift-code";
import { saveSentGift } from "@/lib/use-gifts";
import { LivePackReveal } from "@/components/live-pack-reveal";
import { PackContentsDialog } from "@/components/pack-contents-dialog";
import { useDemo } from "@/components/demo-provider";
import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, parseEther, parseUnits } from "viem";
import { useAccount, useBalance, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { PACK_TIERS, RARITY_NAMES } from "@/lib/contracts";
import { collectPacksAbi, collectPacksAddress, collectPacksLive, collectPacksTierAbi } from "@/lib/collect-packs";
import { PACK_DECIMALS, PACK_SYMBOL, PACK_TOKEN } from "@/lib/tokens";
import { useDexSwap } from "@/lib/use-dex-swap";
import { useApproval } from "@/lib/use-approval";
import { playPurchase, unlockAudio } from "@/lib/sfx";

import { useMyPacks } from "@/lib/use-my-packs";
import { useStockPrices } from "@/lib/use-stock-prices";
import { EDITIONS, editionForTier } from "@/lib/editions";
import { txErrorMessage } from "@/lib/tx-error";
import { cleanButton, cn, RARITY_DOT } from "@/components/clean-ui";
import { PackArt } from "@/components/pack-art";
import { TokenIcon } from "@/components/token-icon";
import { basketForTier } from "@/lib/stock-assets";

/** Packs are paid in USDT; live, BNB is swapped to USDT first. */
const PAYMENTS = ["USDT", "BNB"].map(token => ({ token, label: token }));
/** BNB kept back for gas when paying with BNB. */
const GAS_RESERVE = parseEther("0.001");
/** Extra BNB swapped over the USD price, covering the 0.5% fee and slippage; leftover USDT stays in the wallet. */
const BNB_HEADROOM = 1.03;
/** Every live pack design; each sells one risk tier at the same $1. */
// Live editions plus coming-soon ones (shown, not for sale yet); the picker opens on the live one.
const SHOWN = EDITIONS.filter((edition) => edition.live || edition.comingSoon);
const FIRST = Math.max(0, SHOWN.findIndex((edition) => edition.live));
const amountText = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 8 });
/** Balance under the price: USDT as cents rounded down (never overstated), other tokens to 4 significant digits. */
const balanceText = (value: number, symbol: string) =>
  symbol === "USDT"
    ? (Math.floor(value * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : tokenAmount(value);

/** Centred on the pack: half the carousel height (420 / 470 / 520px) less half the 44px button. */
const stepButton = "absolute top-[188px] z-[3] grid size-11 place-items-center rounded-full border border-border-strong bg-white text-black transition-colors hover:border-black phone:top-[213px] desk:top-[238px]";
const stepperButton = "grid size-[42px] place-items-center disabled:cursor-default disabled:opacity-30";
const status = "mt-3.5 text-sm leading-relaxed text-muted";
/** Labels under a concept edition's facts, in the order lib/editions.ts lists them. */

/** Live: USDT, or BNB swapped to USDT. Demo: USDT. */
const LIVE_PAYMENTS = ["USDT", "BNB"];
const DEMO_PAYMENTS = ["USDT"];

const ownedButton = "flex min-h-12 items-center justify-between gap-2 rounded-md border border-border px-4 text-base transition-colors hover:border-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border";

export function PackPanel() {
  const demo = useDemo();
  const [rawQuantity, setQuantity] = useState(1);
  const [pickedPayment, setPaymentToken] = useState("USDT");

  const [purchasedCount, setPurchasedCount] = useState(1);
  const [showReveal, setShowReveal] = useState(false);
  const { isConnected } = useAccount();
  const [tierId, setTierId] = useState(SHOWN[FIRST]?.tier ?? 0);
  const tier = PACK_TIERS[tierId];
  // Risk budgets (lib/tier-budget): Medium/High may only tie up their share of the pool deposit.
  const tierUsage = useTierUsage();
  const budgeted = TIER_BUDGETS[tierId] !== undefined && !demo.active;
  const left = packsLeft(tierId, tierUsage?.[tierId] ?? 0);
  const maxQty = budgeted ? Math.max(1, Math.min(RISKY_MAX_PER_BUY, left)) : 10;
  const quantity = Math.min(rawQuantity, maxQty);
  const budgetOut = budgeted && collectPacksLive && tierUsage !== null && left === 0;
  // BNB is live-only; anywhere else the picker falls back to USDT.
  const paymentToken = !demo.active && collectPacksLive && isConnected ? pickedPayment : DEMO_PAYMENTS.includes(pickedPayment) ? pickedPayment : "USDT";
  const payment = PAYMENTS.find((item) => item.token === paymentToken)!;
  const { byTicker: demoPrices, failed: pricesFailed } = useStockPrices();
  const demoPrice = paymentToken === "USDT" ? 1 : pricesFailed ? null : demoPrices[paymentToken]?.price;
  const total = demoPrice && demoPrice > 0 ? tier.price * quantity / demoPrice : null;
  const live = !demo.active && collectPacksLive && isConnected;
  // Live packs need a wallet: show Connect in place of a disabled Buy.
  const { openConnect } = useConnectWallet();
  const { address } = useAccount();
  const { unopened, sealed: sealedPacks, refetch: refetchPacks, loading: packsLoading, error: packsError } = useMyPacks();
  const readyPacks = unopened.filter((p) => p.ready).reverse(); // oldest first
  // Packs must open within the reveal window or they open as the tier's lowest card.
  const soonest = unopened.filter((p) => !p.expired && p.blocksLeft !== null).sort((a, b) => a.blocksLeft! - b.blocksLeft!)[0];
  const expiredCount = unopened.filter((p) => p.expired).length;
  // What the last live purchase was, captured when the wallet submits it; the
  // celebration shows once that transaction confirms.
  const [bought, setBought] = useState<{ count: number; tier: string } | null>(null);
  const [openingOwned, setOpeningOwned] = useState(false);
  const [showContents, setShowContents] = useState(false);
  // "As a gift": buy packs held under a code to send someone, instead of for yourself.
  const [asGift, setAsGift] = useState(false);
  // The purchase waiting for Confirm in the pop-up.
  const [confirmBuy, setConfirmBuy] = useState(false);
  const [giftMade, setGiftMade] = useState<{ code: string; tier: number; quantity: number; demo: boolean } | null>(null);

  // Live packs are paid in USDT (PACK_DECIMALS, 18 on BNB Chain) at the tier price ($1, $3 or $5).
  // Paying with BNB swaps just the missing USDT first (KyberSwap), then buys as usual.
  const payBnb = live && paymentToken === "BNB";
  const payToken = payBnb ? "BNB" : PACK_SYMBOL;
  const { data: usdcRaw, refetch: refetchUsdc } = useReadContract({
    address: PACK_TOKEN.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: live, refetchInterval: 15_000 },
  });
  // How many more packs the prize pool can pay for.
  const { data: capacity, refetch: refetchCapacity } = useReadContract({
    address: collectPacksAddress,
    abi: collectPacksAbi,
    functionName: "capacity",
    args: [BigInt(tierId)],
    query: { enabled: live, refetchInterval: 30_000 },
  });
  const { data: paused } = useReadContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "paused", query: { enabled: live, refetchInterval: 30_000 } });
  const comingSoon = live && (paused === true || (capacity !== undefined && capacity < BigInt(quantity)));
  // Which risk tiers are switched on in CollectPacks (off = "Coming soon").
  const { data: tierRows } = useReadContracts({
    allowFailure: true,
    contracts: PACK_TIERS.map((t) => ({ address: collectPacksAddress, abi: collectPacksTierAbi, functionName: "tier" as const, args: [BigInt(t.id)] as const })),
    query: { enabled: collectPacksLive, refetchInterval: 60_000 },
  });
  // The prize pool: USDT the pack contract holds (backs Medium/High prizes). Readable without a wallet.
  const { data: poolRaw } = useReadContract({
    address: PACK_TOKEN.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [collectPacksAddress],
    query: { enabled: collectPacksLive && !demo.active, refetchInterval: 30_000 },
  });
  // Packs each tier can still sell (Low is unlimited: its cards never exceed the price).
  const { data: capacityRows } = useReadContracts({
    allowFailure: true,
    contracts: PACK_TIERS.map((t) => ({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "capacity" as const, args: [BigInt(t.id)] as const })),
    query: { enabled: collectPacksLive && !demo.active, refetchInterval: 30_000 },
  });
  const capacityOf = (id: number): bigint | undefined => {
    const row = capacityRows?.[PACK_TIERS.findIndex((t) => t.id === id)];
    return row?.status === "success" ? (row.result as bigint) : undefined;
  };
  /** Packs a tier can still sell: the lower of the app's risk budget and the contract's capacity; null = unlimited. */
  const leftFor = (id: number): number | null => {
    const budget = TIER_BUDGETS[id] !== undefined && tierUsage ? packsLeft(id, tierUsage[id] ?? 0) : Infinity;
    const c = capacityOf(id);
    const onChain = c === undefined || c > 100_000n ? Infinity : Number(c);
    const n = Math.min(budget, onChain);
    return n === Infinity ? null : n;
  };
  const tierOn: Record<number, boolean | undefined> = Object.fromEntries(PACK_TIERS.map((t, i) => {
    const row = tierRows?.[i];
    // A tier that doesn't exist yet (e.g. Saga Medium before addTier) reads as off.
    return [t.id, row ? (row.status === "success" ? (row.result as { active: boolean }).active : false) : undefined];
  }));
  const tierOff = !demo.active && collectPacksLive && (tierOn[tierId] === false || !editionForTier(tierId).live);
  const needsWallet = !demo.active && collectPacksLive && !isConnected && !tierOff;
  const liveCost = parseUnits(String(tier.price), PACK_DECIMALS) * BigInt(quantity);
  // Contracts pull payments with a standard approval: approve once, then buy.
  const approval = useApproval(live ? PACK_TOKEN.address : null, collectPacksAddress, liveCost);
  const liveBalance = usdcRaw ?? 0n;
  const liveTotal = Number(formatUnits(liveCost, PACK_DECIMALS));

  // ---- pay with BNB: swap the shortfall to USDT, then the normal approve + buy ----
  const { byTicker: tokenPrices } = useStockPrices(60_000, "tokens");
  const bnbUsd = tokenPrices.WBNB?.price ?? null;
  const bnbBalance = useBalance({ address, query: { enabled: live, refetchInterval: 15_000 } });
  const bnbSpendable = (bnbBalance.data?.value ?? 0n) > GAS_RESERVE ? bnbBalance.data!.value - GAS_RESERVE : 0n;
  const shortfall = liveCost > liveBalance ? liveCost - liveBalance : 0n;
  const bnbIn = payBnb && shortfall > 0n && bnbUsd ? parseEther(((Number(formatUnits(shortfall, PACK_DECIMALS)) * BNB_HEADROOM) / bnbUsd).toFixed(12)) : 0n;
  const bnbSwap = useDexSwap({ from: "BNB", to: PACK_SYMBOL, amountIn: bnbIn, slippagePct: "1", enabled: payBnb && bnbIn > 0n });
  const swapDone = bnbSwap.confirmed && !bnbSwap.reverted;
  useEffect(() => {
    if (!swapDone) return;
    void bnbBalance.refetch();
    // Wait for the RPC to show the new USDT (it can lag a block or two), then clear the
    // swap so the panel moves on to approve + buy instead of staying on "Swapping BNB…".
    let stop = false;
    void (async () => {
      for (let i = 0; i < 8 && !stop; i++) {
        const { data } = await refetchUsdc();
        if ((data ?? 0n) >= liveCost) break;
        await new Promise((r) => setTimeout(r, 1_500));
      }
      if (!stop) bnbSwap.reset();
    })();
    return () => { stop = true; };
    // Only when a new swap confirms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapDone]);
  const needsSwap = payBnb && shortfall > 0n;
  // Confirmed, waiting for the new USDT balance: don't offer a second swap.
  const swapping = bnbSwap.busy || (swapDone && needsSwap);
  const bnbShort = needsSwap && !swapping && (bnbIn === 0n || bnbIn > bnbSpendable);

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const busy = isPending || receipt.isLoading;
  useEffect(() => {
    if (!receipt.isSuccess) return;
    playPurchase();
    bnbSwap.reset(); // a finished BNB swap must not read as "Swapping BNB…" once its USDT is spent
    refetchPacks();
    refetchCapacity();
    void refetchUsdc();
    // Only react to a newly confirmed purchase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const selectedBalance = payBnb ? Number(formatUnits(bnbBalance.data?.value ?? 0n, 18)) : live ? Number(formatUnits(liveBalance, PACK_DECIMALS)) : demo.active ? demo.balances[paymentToken] ?? 0 : null;
  const insufficient = payBnb ? bnbShort : live ? liveCost > liveBalance : selectedBalance !== null && total !== null && selectedBalance < total;
  const liveSupported = live;
  const payments = PAYMENTS.filter((item) => (live ? LIVE_PAYMENTS : DEMO_PAYMENTS).includes(item.token));
  const payLabel = PAYMENTS.find((item) => item.token === (live ? payToken : paymentToken))?.label ?? PACK_SYMBOL;
  /** BNB to pay, shown approximately; 0 when the USDT already in the wallet covers it. */
  const bnbCost = Number(formatUnits(bnbIn, 18));

  /** Runs once the purchase is confirmed. */
  function purchase() {
    setConfirmBuy(false);
    if (demo.active) {
      if (asGift) {
        const code = demo.buyGift(tierId, quantity, paymentToken, demoPrice ?? 0);
        if (code) { playPurchase(); setGiftMade({ code, tier: tierId, quantity, demo: true }); }
      } else if (demo.buyPacks(tierId, quantity, paymentToken, demoPrice ?? 0)) { playPurchase(); setPurchasedCount(quantity); setShowReveal(true); }
    } else if (live) {
      buyLive();
    }
  }

  function buyLive() {
    unlockAudio();
    if (approval.needsApproval) { approval.approve(); return; }
    reset();
    setBought(null);
    if (asGift && address) {
      // The code is made and saved before sending, so it's never lost.
      const { code, signer } = newLiveCode();
      const gift = { code, tier: tierId, quantity };
      saveSentGift(address, { ...gift, signer, createdAt: Date.now() });
      writeContract(
        { address: collectPacksAddress, abi: collectPacksAbi, functionName: "buyGift", args: [BigInt(tierId), BigInt(quantity), signer] },
        { onSuccess: () => setGiftMade({ ...gift, demo: false }) },
      );
      return;
    }
    // A pack commits to the next block's hash when bought; it can open one block later.
    writeContract(
      { address: collectPacksAddress, abi: collectPacksAbi, functionName: "buy", args: [BigInt(tierId), BigInt(quantity)] },
      { onSuccess: () => setBought({ count: quantity, tier: tier.name }) },
    );
  }


  const [index, setIndex] = useState(FIRST);
  const [prevIndex, setPrevIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<number | null>(null);
  // The centred pack tilts toward the mouse (.pack-tilt in globals.css). Its
  // children ignore pointer events for dragging, so the carousel tracks it.
  const tiltPack = useRef<HTMLDivElement>(null);
  function tiltTo(e: React.PointerEvent) {
    const el = tiltPack.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const px = (e.clientX - box.left) / box.width;
    const py = (e.clientY - box.top) / box.height;
    const over = e.pointerType === "mouse" && dragFrom.current === null && px >= 0 && px <= 1 && py >= 0 && py <= 1;
    if (!over) return untilt();
    el.style.setProperty("--px", String(px));
    el.style.setProperty("--py", String(py));
    el.dataset.active = "";
  }
  function untilt() {
    const el = tiltPack.current;
    if (!el) return;
    el.style.removeProperty("--px");
    el.style.removeProperty("--py");
    delete el.dataset.active;
  }
  const edition = SHOWN[index];
  const goTo = (next: number) => {
    const target = ((next % SHOWN.length) + SHOWN.length) % SHOWN.length;
    if (target === index) return;
    setPrevIndex(index);
    setIndex(target);
    setTierId(SHOWN[target].tier);
  };
  const step = (delta: number) => goTo(index + delta);

  // Hold and swipe horizontally to change pack. Arrows and dots still work, so
  // this is an addition rather than the only way through.
  const SWIPE_PX = 60;
  function onPointerDown(e: React.PointerEvent) {
    if (!e.isPrimary || e.button !== 0) return;
    untilt();
    dragFrom.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  // Past this the pack keeps following the cursor, just with resistance, so
  // it never looks frozen when the pointer leaves the box.
  const FREE_DRAG_PX = 160;
  function onPointerMove(e: React.PointerEvent) {
    if (dragFrom.current === null) return tiltTo(e);
    const dx = e.clientX - dragFrom.current;
    const distance = Math.abs(dx);
    const eased = distance <= FREE_DRAG_PX ? distance : FREE_DRAG_PX + (distance - FREE_DRAG_PX) * 0.3;
    setDrag(Math.sign(dx) * eased);
  }
  // A press that barely moved is a click: open "what's inside" for live packs.
  const CLICK_PX = 6;
  function onPointerUp() {
    if (dragFrom.current === null) return;
    if (Math.abs(drag) > SWIPE_PX) step(drag < 0 ? 1 : -1);
    else if (Math.abs(drag) < CLICK_PX && edition.live) setShowContents(true);
    dragFrom.current = null;
    setDragging(false);
    setDrag(0);
  }

  return (
    // Plain class names (featured-pack, pack-*) are hooks for the /v2 dev UI's overrides.
    <div className="featured-pack grid grid-cols-1 items-start gap-8 desk:grid-cols-2 desk:gap-12">
      <div className="featured-pack-art relative flex min-w-0 touch-pan-y flex-col items-center overflow-hidden pb-5 select-none">
        <button
          type="button"
          className={cn("pack-step left-2", stepButton, SHOWN.length < 2 && "hidden")}
          onClick={() => step(-1)}
          aria-label={`Show the ${SHOWN[(index - 1 + SHOWN.length) % SHOWN.length].name} pack`}
        >
          <ArrowLeftIcon weight="bold" />
        </button>

        <div
          className="pack-carousel relative h-[340px] w-full touch-pan-y overflow-hidden phone:h-[380px] desk:h-[520px]"
        >
          {SHOWN.map((e, i) => {
            // Shortest circular offset: -1 sits left, 0 centre, 1 right, so the
            // neighbour is always already rendered and slides in as you drag.
            const n = SHOWN.length;
            // A single pack always sits in the centre.
            const offset = n < 2 ? 0 : ((i - index + 1 + n) % n) - 1;
            const isCurrent = offset === 0;
            // With three slides one must always jump from one side to the
            // other; animating that makes the wrap look like it runs backwards,
            // so the slide that crossed moves without a transition.
            const before = n < 2 ? 0 : ((i - prevIndex + 1 + n) % n) - 1;
            const wrapped = Math.abs(offset - before) > 1;
            const motion = dragging || wrapped ? "none" : undefined;
            return (
              <div
                key={e.id}
                className={cn("pointer-events-none absolute inset-0 grid place-items-center transition-transform duration-[550ms] ease-[cubic-bezier(.22,.75,.25,1)]", isCurrent ? "z-[1]" : "")}
                style={{ transform: `translateX(calc(${offset} * (50% + 200px) + ${drag}px))`, transition: motion }}
                aria-hidden={!isCurrent}
              >
                <div
                  ref={isCurrent ? tiltPack : undefined}
                  role="img"
                  aria-label={`${e.name} mystery pack`}
                  // Only the centred pack takes the pointer (drag to swipe, click for contents), so the arrows beside it stay clear.
                  className={cn("pack-tilt relative w-[260px] max-w-[68%] touch-pan-y select-none max-desk:scale-[0.8]", isCurrent ? cn("pointer-events-auto", dragging ? "cursor-grabbing" : "cursor-grab") : "")}
                  // No native drag of the artwork: it would leave a ghost copy instead of swiping.
                  onDragStart={(ev) => ev.preventDefault()}
                  {...(isCurrent && { onPointerDown, onPointerMove, onPointerLeave: untilt, onPointerUp, onLostPointerCapture: onPointerUp, onPointerCancel: () => { dragFrom.current = null; setDragging(false); setDrag(0); } })}
                >
                  <PackArt
                    edition={e}
                    large
                    className="origin-[center_65%] transition-transform duration-[550ms] ease-[cubic-bezier(.22,.75,.25,1)]"
                    style={{ transform: `rotate(${offset * 18 + drag / 18}deg)`, transition: motion }}
                  />
                  <span className="holo-glare rounded-[4px]" aria-hidden="true" />
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className={cn("pack-step right-2", stepButton, SHOWN.length < 2 && "hidden")}
          onClick={() => step(1)}
          aria-label={`Show the ${SHOWN[(index + 1) % SHOWN.length].name} pack`}
        >
          <ArrowRightIcon weight="bold" />
        </button>

        <div className={cn("pack-dots flex max-desk:mt-3", SHOWN.length < 2 && "hidden")} role="group" aria-label="Pack edition">
          {SHOWN.map((e, i) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={i === index}
              aria-label={e.name}
              className="relative size-8 after:absolute after:inset-3 after:rounded-full after:border after:border-border-strong aria-pressed:after:border-black aria-pressed:after:bg-black"
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>

      {/* Desktop: starts level with the top of the pack (centred 400px tall in the 520px carousel, so 60px down). */}
      <div className="featured-pack-copy min-w-0 pb-8 desk:pt-[60px]" aria-live="polite">
        <div className="featured-pack-switch mb-6">
          <div className="flex items-baseline justify-between gap-3">
            <h3 key={edition.id} className="text-[28px] leading-[1.2] font-normal tracking-tight">{edition.name}</h3>
            {/* Price and risk are in the boxes below; the top right links to the odds behind them. */}
            <button type="button" aria-haspopup="dialog" className="inline-flex shrink-0 items-center gap-1 text-base underline-offset-4 hover:underline" onClick={() => setShowContents(true)}>
              Odds and Rewards <ArrowUpRightIcon weight="bold" />
            </button>
          </div>
          <p className="featured-pack-subtitle mt-1 text-base text-muted">{edition.subtitle}</p>
          {/* The five stocks this edition draws from (every risk level). */}
          <ul className="pack-basket mt-4 flex list-none flex-wrap gap-1.5 p-0" aria-label="Draws from">
            {basketForTier(edition.tier).map((ticker) => (
              <li key={ticker} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm"><TokenIcon symbol={ticker} className="size-4" />{ticker}</li>
            ))}
          </ul>
        </div>
        {poolRaw !== undefined && (
          <p className="pack-pool mb-3 flex items-baseline justify-between gap-3 text-sm text-muted">
            <span>Prize pool</span>
            <span className="text-base text-black tabular-nums">${Number(formatUnits(poolRaw, PACK_DECIMALS)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </p>
        )}
        {/* Risk: the same pack at Low, Medium or High risk. */}
        {(edition.live || edition.comingSoon) && (edition.tiers?.length ?? 0) > 1 && (
          <div className="pack-tier-picker mb-6 grid grid-cols-3 gap-1.5" role="group" aria-label="Risk">
            {edition.tiers!.map((id) => {
              const t = PACK_TIERS[id];
              return (
                <button
                  type="button"
                  key={id}
                  aria-pressed={tierId === id}
                  onClick={() => setTierId(id)}
                  className="flex min-w-0 flex-col gap-0.5 rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:border-black aria-pressed:border-black"
                >
                  <strong className="text-base font-normal">{t.level}</strong>
                  <span className="truncate text-[13px] text-muted">{tierOn[id] === false && !demo.active ? "Coming soon" : !demo.active ? (() => { const n = leftFor(id); return n === null ? <span aria-label="Unlimited">∞</span> : n === 0 ? "Sold out" : <><span className="tabular-nums">{n}</span> left</>; })() : <span className="tabular-nums">{t.range.replace(" in stocks", "")}</span>}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* The selected risk's odds: chance of each rarity and what that card holds. */}
        {(edition.live || edition.comingSoon) && (
          <dl className="pack-odds mb-6 grid grid-cols-2 gap-1.5 max-desk:hidden phone:grid-cols-4" aria-label={`${tier.level} risk odds`}>
            {RARITY_NAMES.map((name, r) => (
              <div key={name} className="flex min-w-0 flex-col gap-0.5 rounded-md bg-surface-muted px-3 py-2.5">
                <dt className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: RARITY_DOT[r] }} aria-hidden="true" />
                  <span className="truncate">{name}</span>
                </dt>
                <dd className="text-base tabular-nums">{tier.odds[r]}%</dd>
                <dd className="truncate text-[13px] text-muted tabular-nums">${tier.backing[r].toFixed(2)}</dd>
              </div>
            ))}
          </dl>
        )}
      {(edition.live || edition.comingSoon) && <>
      <div className="pack-checkout">
        <div className="pack-checkout-fields flex items-center justify-between gap-4">
          <details className="group relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
            <summary aria-label={`Payment token: ${payLabel}`} className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-border px-3 text-base transition-colors hover:border-border-strong group-open:border-black [&::-webkit-details-marker]:hidden">
              {payLabel}
              <span className="ml-1 text-muted transition-transform group-open:rotate-180" aria-hidden="true"><CaretDownIcon /></span>
            </summary>
            <div className="frost absolute top-[calc(100%+8px)] left-0 z-10 w-[220px] animate-[popover-in_.15s_ease-out] rounded-md border border-border bg-white/72 backdrop-blur-[14px] p-1.5 shadow-[0_12px_30px_#0000001a]" role="group" aria-label="Payment token">
              {payments.map((item) => <button type="button" key={item.token} aria-pressed={payToken === item.token} className="flex min-h-9 w-full items-center justify-between rounded px-2.5 py-2 text-sm transition-colors hover:bg-surface-muted aria-pressed:bg-surface-muted" onClick={(event) => { setPaymentToken(item.token); const picker = event.currentTarget.closest("details"); if (picker) { picker.open = false; picker.querySelector("summary")?.focus(); } }}><span>{item.label}</span><span className="text-[13px] text-muted">{demo.active ? amountText(demo.balances[item.token] ?? 0) : live ? amountText(item.token === "BNB" ? Number(formatUnits(bnbBalance.data?.value ?? 0n, 18)) : Number(formatUnits(liveBalance, PACK_DECIMALS))) : paymentToken === item.token && selectedBalance !== null ? amountText(selectedBalance) : ""}</span></button>)}
            </div>
          </details>
          <div className="flex h-11 items-center rounded-md border border-border">
            <button type="button" className={stepperButton} aria-label="Decrease pack quantity" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}><MinusIcon /></button>
            <input id="pack-quantity" aria-label={`Pack quantity, maximum ${maxQty}`} type="number" min={1} max={maxQty} step={1} value={quantity} className="w-[34px] min-w-0 text-center text-base tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" onChange={(event) => setQuantity(Math.min(maxQty, Math.max(1, Math.trunc(Number(event.target.value) || 1))))} />
            <button type="button" className={stepperButton} aria-label="Increase pack quantity" disabled={quantity >= maxQty} onClick={() => setQuantity((value) => Math.min(maxQty, value + 1))}><PlusIcon /></button>
          </div>
        </div>
        {/* Phones: price and Buy stick to the bottom of the screen, so buying needs no scrolling. */}
        <div className="pack-buy-bar mt-6 flex items-center justify-between gap-2 border-t border-border pt-6 phone:gap-4 max-desk:sticky max-desk:bottom-0 max-desk:z-20 max-desk:-mx-[18px] max-desk:bg-white max-desk:px-[18px] max-desk:pt-4 max-desk:pb-[max(16px,env(safe-area-inset-bottom))] phone:max-desk:-mx-6 phone:max-desk:px-6">
          <div className="min-w-0">
            <strong className="pack-checkout-price block text-[28px] leading-none font-normal tracking-[-0.02em]"><span className="tabular-nums">{needsSwap ? (bnbIn > 0n ? `≈${tokenAmount(bnbCost)}` : "…") : live ? amountText(liveTotal) : total === null ? "…" : amountText(total)}</span> <span className="text-sm tracking-normal text-muted">{needsSwap ? "BNB" : live ? PACK_SYMBOL : payment.label}</span></strong>
            <p className="mt-3 text-sm text-muted">
              {selectedBalance !== null && <>Balance <span className="tabular-nums">{balanceText(selectedBalance, live ? payToken : payment.label)}</span><span className="max-phone:hidden"> · </span></>}
              <Link href="/trade" className={cn("whitespace-nowrap text-black underline-offset-4 hover:underline", selectedBalance !== null && "max-phone:hidden")}>Get more {payLabel}</Link>
            </p>
          </div>
          {needsWallet ? (
            <button type="button" className={cn(cleanButton.solid, "shrink-0 px-5")} onClick={openConnect}>
              Connect wallet <ArrowUpRightIcon weight="bold" />
            </button>
          ) : <button
            type="button"
            className={cn(cleanButton.solid, "shrink-0 px-5")}
            disabled={insufficient || comingSoon || tierOff || budgetOut || approval.approving || swapping || (demo.active ? total === null : !isConnected || busy || !collectPacksLive || !liveSupported)}
            aria-haspopup="dialog"
            onClick={() => {
              // Everything, including a USDT approval, is confirmed in the pop-up before signing.
              unlockAudio();
              setConfirmBuy(true);
            }}
          >
            {tierOff ? "Coming soon" : budgetOut ? "Sold out" : swapping ? "Swapping BNB…" : approval.approving ? "Approving…" : busy && !demo.active ? "Working…" : comingSoon ? (capacity === 0n ? "Sold out" : `Only ${capacity} left`) : insufficient ? `Insufficient ${live ? payToken : payment.label}` : <>{`${asGift ? "Gift" : "Buy"} ${live ? `${editionForTier(tierId).name} ` : ""}${quantity === 1 ? "pack" : `${quantity} packs`}`} <ArrowUpRightIcon weight="bold" /></>}
          </button>}
        </div>
      </div>
      {/* Packs you own: open them here, or go to them in your collection. */}
      {live && unopened.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" aria-haspopup="dialog" className={ownedButton} disabled={readyPacks.length === 0 && sealedPacks.length === 0} onClick={() => setOpeningOwned(true)}>
            {readyPacks.length > 0 || sealedPacks.length > 0 ? "Open packs" : "Revealing…"}
            <span className="text-muted tabular-nums">{readyPacks.length > 0 ? readyPacks.length : sealedPacks.length > 0 ? sealedPacks.length : unopened.length}</span>
          </button>
          <Link href="/collection" className={ownedButton}>Your packs <ArrowUpRightIcon weight="bold" /></Link>
        </div>
      )}
      {demo.active && (demo.balances.PACK ?? 0) > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" aria-haspopup="dialog" className={ownedButton} onClick={() => { unlockAudio(); setPurchasedCount(demo.balances.PACK ?? 0); setShowReveal(true); }}>
            Open packs <span className="text-muted tabular-nums">{demo.balances.PACK}</span>
          </button>
          <Link href="/collection" className={ownedButton}>Your packs <ArrowUpRightIcon weight="bold" /></Link>
        </div>
      )}
      {/* Got a gift? Claim it here without leaving the page. */}
      <GiftClaimLink className="mt-6" />
      {/* Back from a Google sign-in started here: reopens the claim with its code. */}
      <GiftFromLink />
      </>}
      {demo.active && total === null && <p className={status} role="status">Token price unavailable. Try USDT or wait for prices.</p>}
      {confirmBuy && (() => {
        const unit = live ? PACK_SYMBOL : payment.label;
        const cost = live ? liveTotal : total;
        const usdtHeld = live ? Number(formatUnits(liveBalance, PACK_DECIMALS)) : selectedBalance;
        return cost === null ? null : (
          <PackConfirmDialog
            edition={editionForTier(tierId)}
            name={tier.name}
            risk={tier.risk}
            quantity={quantity}
            total={`${amountText(cost)} ${unit}`}
            balance={usdtHeld === null ? null : `${amountText(usdtHeld)} ${unit}`}
            after={usdtHeld === null || needsSwap ? null : `${amountText(usdtHeld - cost)} ${unit}`}
            swap={needsSwap ? { bnb: `≈${tokenAmount(bnbCost)} BNB`, swapping, ready: Boolean(bnbSwap.route) && !bnbShort, onSwap: () => { bnbSwap.reset(); void bnbSwap.swap(); } } : undefined}
            points={quantity}
            gift={asGift}
            onGiftChange={setAsGift}
            needsApproval={live && approval.needsApproval}
            approving={approval.approving}
            onApprove={approval.approve}
            onConfirm={purchase}
            onClose={() => { setConfirmBuy(false); setAsGift(false); }}
          />
        );
      })()}
      {giftMade && <GiftCodeDialog {...giftMade} onClose={() => setGiftMade(null)} />}
      {demo.active && showReveal && <DemoPackReveal purchasedCount={purchasedCount} onClose={() => setShowReveal(false)} />}
      {showContents && (
        <PackContentsDialog stockBacked={collectPacksLive || demo.active} initialTier={tierId} onTierChange={(t) => { const target = SHOWN.findIndex((e) => e.tier === t || e.tiers?.includes(t)); if (target >= 0 && target !== index) goTo(target); setTierId(t); }} onClose={() => setShowContents(false)} />
      )}
      {live && packsLoading && <p className={status} role="status">Loading your packs…</p>}
      {live && packsError && <p className={status} role="alert">Could not refresh your packs. <button type="button" className="text-black underline underline-offset-4" onClick={() => { void refetchPacks(); }}>Retry</button></p>}
      {live && soonest && (
        <p className={status} role="status">
          Open within {soonest.blocksLeft} blocks (about {Math.max(1, Math.round((soonest.blocksLeft! * 2) / 60))} min), or it opens as the tier’s lowest card.
        </p>
      )}
      {live && expiredCount > 0 && <p className={status} role="status">{expiredCount} expired: {expiredCount === 1 ? "it opens" : "they open"} as the tier’s lowest card.</p>}
      {live && openingOwned && <LivePackReveal ready={readyPacks} sealed={sealedPacks} onClose={() => setOpeningOwned(false)} onOpened={refetchPacks} />}
      {live && bought && receipt.isSuccess && (
        <LivePackReveal ready={readyPacks} sealed={sealedPacks} purchasedCount={bought.count} tierName={bought.tier} afterHash={hash} onClose={() => setBought(null)} onOpened={refetchPacks} />
      )}
      {approval.error && <p className={status} role="alert">{txErrorMessage(approval.error)}</p>}
      {needsSwap && (bnbSwap.error || bnbSwap.quoteError) && <p className={status} role="alert">{bnbSwap.error ? txErrorMessage(new Error(bnbSwap.error)) : `BNB swap: ${bnbSwap.quoteError}`}</p>}
      {needsSwap && bnbSwap.reverted && <p className={status} role="alert">BNB swap failed. Try again.</p>}
      {error && (
        <p className="featured-pack-error mt-3.5 rounded-md border border-border-strong px-3 py-2.5 text-sm leading-relaxed break-words text-down" role="alert">
          {txErrorMessage(error)}
        </p>
      )}

      </div>
    </div>
  );
}
