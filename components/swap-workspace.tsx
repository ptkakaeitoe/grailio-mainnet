"use client";

import { RecentTrades } from "@/components/recent-trades";
import { saveSwap, updateSwap } from "@/lib/recent-swaps";
import { SWAP_FEE_BPS } from "@/lib/swap-fee";
import { ArrowRightIcon, ArrowsDownUpIcon, CaretDownIcon } from "@phosphor-icons/react/ssr";
import { cleanButton, cleanChip, cleanField, cn } from "@/components/clean-ui";
import { useDemo } from "@/components/demo-provider";
import { DemoPriceChart } from "@/components/demo-price-chart";
import { ReviewSwapDialog } from "@/components/review-swap-dialog";
import { SwapSuccessDialog } from "@/components/swap-success-dialog";
import { TokenIcon } from "@/components/token-icon";
import { useEffect, useRef, useState } from "react";
import { useConnectWallet } from "@/components/beta-access";
import { formatUnits, parseEther } from "viem";
import { appChain } from "@/lib/chain";
import { useAccount } from "wagmi";
import { useCards } from "@/lib/use-cards";
import { tokenFor } from "@/lib/tokens";
import { toUnits, useDexBalances, useDexSwap } from "@/lib/use-dex-swap";
import { usd, useStockPrices } from "@/lib/use-stock-prices";
import { txErrorMessage } from "@/lib/tx-error";

/** What tokens are paid with. USDC counts as $1. */
const BASES = ["USDC", "BNB"] as const;
type Base = (typeof BASES)[number];
const BASE_NAMES: Record<Base, string> = { USDC: "USD Coin", BNB: "BNB Chain" };

const fmt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 6 });

const tokenIcon = "swap-token-icon size-7 shrink-0";
const tokenChip =
  "inline-flex shrink-0 items-center gap-2 rounded-full border border-border-strong bg-transparent py-1.5 pr-3 pl-1.5 text-base";
const caption = "flex justify-between gap-3 text-sm text-muted";
const amountRow =
  "swap-amount-row mt-3 flex items-center justify-between gap-3";
const amountText =
  "min-w-0 flex-1 bg-transparent text-[30px] tracking-[-0.03em] tabular-nums outline-none phone:text-[40px]";
const errorText = "mt-3 text-sm break-words text-down";

/** Shows at most 6 decimals (rounded down), e.g. 0.0161574953301281 -> 0.016157. */
function trimAmount(text: string) {
  const [whole, frac = ""] = text.split(".");
  const cut = frac.slice(0, 6).replace(/0+$/, "");
  return cut ? `${whole}.${cut}` : whole;
}

type TokenOption = { symbol: string; name: string; accent?: string };

/** A token chip that opens a searchable list; closes on a pick, outside click or Escape. */
function TokenPicker({ id, label, value, options, onSelect, balanceOf, priceOf }: {
  id: string;
  label: string;
  value: string;
  options: TokenOption[];
  onSelect: (symbol: string) => void;
  balanceOf: (symbol: string) => number | null;
  priceOf: (symbol: string) => number | null;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const current = options.find((o) => o.symbol === value);
  const q = search.toLowerCase().trim();
  const heldValue = (sym: string) => (balanceOf(sym) ?? 0) * (priceOf(sym) ?? 0);
  // Tokens you hold come first (largest value first); the rest keep their usual order.
  const matches = options
    .filter((o) => `${o.symbol} ${o.name}`.toLowerCase().includes(q))
    .map((o, i) => ({ o, i, v: heldValue(o.symbol) }))
    .sort((a, b) => (b.v > 0 || a.v > 0 ? b.v - a.v : a.i - b.i))
    .map((x) => x.o);
  function pick(symbol: string) {
    onSelect(symbol);
    setOpen(false);
    setSearch("");
  }
  return (
    <div className="relative shrink-0" ref={box}>
      <button
        ref={button}
        type="button"
        className={cn(cleanButton.outline, tokenChip, "min-h-10 hover:border-black hover:bg-surface-muted hover:text-black")}
        onClick={() => { setOpen(!open); setSearch(""); }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${value}`}
      >
        <TokenIcon symbol={value} color={current?.accent} className={tokenIcon} />
        {value}
        <span className="text-muted" aria-hidden="true"><CaretDownIcon /></span>
      </button>
      {open && (
        <div
          className="frost absolute top-[calc(100%+8px)] right-0 z-40 w-[min(310px,calc(100vw-48px))] animate-[popover-in_.15s_ease-out] rounded-md border border-border bg-white/72 backdrop-blur-[14px] p-2.5 shadow-[0_12px_30px_#0000001a]"
          id={id}
          role="dialog"
          aria-label={label}
        >
          <input
            autoFocus
            type="search"
            className={cn(cleanField, "h-10 text-sm")}
            aria-label="Search tokens"
            placeholder="Search name or ticker"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) pick(matches[0].symbol); }}
          />
          <ul className="mt-1.5 max-h-[300px] list-none overflow-y-auto">
            {matches.map((o) => {
              const held = balanceOf(o.symbol);
              const price = priceOf(o.symbol);
              return (
                <li key={o.symbol}>
                  <button
                    type="button"
                    className="flex min-h-[52px] w-full items-center gap-2.5 rounded p-2 text-left hover:bg-surface-muted focus-visible:bg-surface-muted aria-[current=true]:bg-accent-soft"
                    aria-current={value === o.symbol ? "true" : undefined}
                    onClick={() => pick(o.symbol)}
                  >
                    <TokenIcon symbol={o.symbol} color={o.accent} className={tokenIcon} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <strong className="text-sm font-medium">{o.name}</strong>
                      <span className="text-xs text-muted">{o.symbol}</span>
                    </span>
                    <span className="ml-auto flex flex-col items-end gap-0.5 text-[13px] tabular-nums">
                      {/* What you hold of it, and that amount in dollars. */}
                      {held !== null && held > 0 ? (
                        <>
                          <span>{fmt(held)}</span>
                          <span className="text-xs text-muted">{price != null ? usd(held * price) : "—"}</span>
                        </>
                      ) : (
                        <span className="text-muted-soft">—</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {matches.length === 0 && <p className="px-2 pt-3.5 pb-1.5 text-sm text-muted">No matching tokens.</p>}
        </div>
      )}
    </div>
  );
}

export function SwapWorkspace() {
  const demo = useDemo();
  const { openConnect, unlocked } = useConnectWallet();
  const { address, chain } = useAccount();
  // Live = a real swap through the DEX aggregator, signed by the user's wallet.
  const live =
    !demo.active &&
    unlocked === true &&
    Boolean(address) &&
    chain?.id === appChain.id;

  // A settled swap: what left the wallet and what arrived. Shown in SwapSuccessDialog.
  type SwapLegs = { paid: string; received: string };
  const [result, setResult] = useState<(SwapLegs & { hash?: string }) | null>(
    null,
  );
  // Demo mode trades stocks; the live app trades BNB Chain tokens.
  const { cards } = useCards();
  const STOCKS = [cards[2], cards[0], cards[3], cards[1], cards[4]]; // Neural Eye first in the market dropdown
  const COMPANIES: Record<string, string> = Object.fromEntries(cards.map((c) => [c.ticker, c.tokenName]));
  // Any token for any token: USDC and BNB plus every stock (demo) or token (live).
  const TOKEN_LIST: TokenOption[] = [
    ...BASES.map((b) => ({ symbol: b, name: BASE_NAMES[b] })),
    ...STOCKS.map((c) => ({ symbol: c.ticker, name: COMPANIES[c.ticker], accent: c.accent })),
  ];
  const [fromPick, setFrom] = useState<string>("USDC");
  const [toPick, setTo] = useState<string>(STOCKS[0].ticker);
  const [amount, setAmountText] = useState("");
  // 25/50/75/Max fill the exact wei; the box shows it trimmed. Typing clears it.
  const [exactWei, setExactWei] = useState<bigint | null>(null);
  const setAmount = (text: string, exact: bigint | null = null) => { setAmountText(text); setExactWei(exact); };
  const [slippage, setSlippage] = useState("1");
  // Live swaps are reviewed in Grailio's own pop-up before anything is signed.
  const [reviewing, setReviewing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { byTicker } = useStockPrices();
  // Switching demo on or off changes the list; fall back to USDC -> the first token.
  const known = (sym: string) => TOKEN_LIST.some((t) => t.symbol === sym);
  const from = known(fromPick) ? fromPick : "USDC";
  const to = known(toPick) && toPick !== from ? toPick : STOCKS.find((c) => c.ticker !== from)!.ticker;
  // The chart and its market dropdown follow the token being traded (not USDC/BNB).
  const isBase = (sym: string) => (BASES as readonly string[]).includes(sym);
  const ticker = !isBase(to) ? to : !isBase(from) ? from : STOCKS[0].ticker;
  const parsed = Number.parseFloat(amount);
  const hasAmount = Number.isFinite(parsed) && parsed > 0;

  // ---- live balances + quote (real DEX route) ----
  const balances = useDexBalances(live);
  /** BNB keeps a little back for gas, so "Use max" never strands the wallet. */
  const GAS_BUFFER = parseEther("0.02");
  const liveRaw = (symbol: string) => {
    const raw = balances.raw(symbol);
    if (symbol !== "BNB") return raw;
    return raw > GAS_BUFFER ? raw - GAS_BUFFER : 0n;
  };
  const amountWei = exactWei ?? (hasAmount ? toUnits(amount, from) : 0n);
  const dex = useDexSwap({ from, to, amountIn: amountWei, slippagePct: slippage, enabled: live });
  const approval = dex.approval;
  const busy = dex.busy;

  // Summary of the swap in flight, captured at submit so the form can reset.
  const [submitted, setSubmitted] = useState<SwapLegs | null>(null);
  useEffect(() => {
    if (!dex.confirmed) return;
    balances.refetch();
    // Only react to a newly confirmed swap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dex.confirmed]);
  const liveResult =
    dex.confirmed && !dex.reverted && submitted && dex.hash
      ? { ...submitted, hash: dex.hash }
      : null;

  // Recent trades (lib/recent-swaps): saved as pending once sent, settled when the receipt lands.
  const tradesOwner = live ? address : demo.active ? "demo" : null;
  useEffect(() => {
    if (!live || !address || !dex.hash || !submitted) return;
    saveSwap(address, { id: dex.hash, hash: dex.hash, paid: submitted.paid, received: submitted.received, time: Math.floor(Date.now() / 1000), status: "pending" });
    // Only when a new swap transaction appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dex.hash]);
  useEffect(() => {
    if (!live || !address || !dex.hash || !dex.confirmed) return;
    updateSwap(address, { hash: dex.hash }, { status: dex.reverted ? "failed" : "confirmed" });
  }, [live, address, dex.hash, dex.confirmed, dex.reverted]);

  // ---- demo quote, at live stock prices (Yahoo Finance) ----
  const avaxUsd = byTicker.WBNB?.price ?? null;
  const usdOf = (sym: string) => (sym === "USDC" ? 1 : sym === "BNB" ? avaxUsd : byTicker[sym]?.price ?? null);
  const fromUsd = usdOf(from);
  const toUsd = usdOf(to);
  const demoReceived = fromUsd && toUsd && hasAmount ? (parsed * fromUsd) / toUsd : null;

  const received = live ? dex.amountOut : demoReceived;
  const balance = (symbol: string) =>
    live
      ? balances.amount(symbol)
      : demo.active
        ? (demo.balances[symbol] ?? 0)
        : null;

  const valid = received !== null && Number.isFinite(received) && received > 0;
  const fromBalance = balance(from);
  const insufficient = live
    ? amountWei > balances.raw(from) - (from === "BNB" ? GAS_BUFFER : 0n)
    : fromBalance !== null && parsed > fromBalance;

  function submitDemo() {
    if (demoReceived !== null && demo.swap(from, to, parsed, demoReceived)) {
      const legs = { paid: `${parsed} ${from}`, received: `${demoReceived.toFixed(6)} ${to}` };
      setResult(legs);
      saveSwap("demo", { id: `demo-${Date.now()}`, ...legs, time: Math.floor(Date.now() / 1000), status: "confirmed" });
      setAmount("");
    }
  }

  async function submitLive() {
    if (!dex.route || amountWei === 0n || dex.amountOut === null) return;
    if (approval.needsApproval) {
      approval.approve();
      return;
    }
    setResult(null);
    setSubmitted(null);
    const summary = { paid: `${amount} ${from}`, received: `${fmt(dex.amountOut)} ${to}` };
    await dex.swap(() => {
      setSubmitted(summary);
      setAmount("");
      setReviewing(false);
    });
  }

  /** Fill the pay field with a share of the balance: exact wei when live. */
  const canFill =
    fromBalance !== null && fromBalance > 0 && (!live || liveRaw(from) > 0n);
  function fillPercent(percent: number) {
    if (!canFill) return;
    if (live) {
      const raw = (liveRaw(from) * BigInt(percent)) / 100n;
      setAmount(trimAmount(formatUnits(raw, tokenFor(from)?.decimals ?? 18)), raw);
    } else {
      setAmount(String(Number((((fromBalance ?? 0) * percent) / 100).toFixed(6))));
    }
    setResult(null);
  }

  function reset() {
    setResult(null);
    setAmount("");
  }
  /** Market dropdown: trade this token (paying with USDC if it was the pay side). */
  function selectStock(next: string) {
    if (from === next) setFrom("USDC");
    setTo(next);
    reset();
  }
  // Picking the token already on the other side swaps the two.
  function choosePay(sym: string) {
    if (sym === to) setTo(from);
    setFrom(sym);
    reset();
  }
  function chooseReceive(sym: string) {
    if (sym === from) setFrom(to);
    setTo(sym);
    reset();
  }
  const pickerProps = { options: TOKEN_LIST, balanceOf: balance, priceOf: usdOf };
  const payChip = <TokenPicker {...pickerProps} id="pay-token" label="Token to pay with" value={from} onSelect={choosePay} />;
  const receiveChip = <TokenPicker {...pickerProps} id="receive-token" label="Token to receive" value={to} onSelect={chooseReceive} />;
  const nameOf = (sym: string) => TOKEN_LIST.find((t) => t.symbol === sym)?.name ?? sym;

  const shown = live ? liveResult : result;
  const txMessage = dex.error;
  const idleAction = !address ? openConnect : demo.start;
  const submitLabel = live
    ? approval.approving
      ? "Approving…"
      : busy
        ? dex.hash
          ? "Swapping…"
          : "Confirm in wallet…"
        : !hasAmount
          ? "Enter an amount"
          : insufficient
            ? `Insufficient ${from}`
            : dex.quoteError
              ? "No route"
              : !valid
                ? "Finding best route…"
                : approval.needsApproval
                  ? `Approve ${from}`
                  : "Swap"
    : !demo.active
      ? !address
        ? "Connect wallet to swap"
        : "Try demo swap"
      : !valid
        ? "Enter an amount"
        : insufficient
          ? `Insufficient ${from}`
          : "Swap";

  return (
    // Shared trade layout; /v2 applies presentation overrides to these classes.
    <div className="trade-workspace">
      <div className="trade-layout pt-6 pb-16 desk:pt-16">

        {/* Market data and the watchlist in one: the chart's title is a dropdown of the five tokens. */}
        <DemoPriceChart
          key={ticker}
          ticker={ticker}
          markets={STOCKS.map((c) => ({ ticker: c.ticker, name: COMPANIES[c.ticker], accent: c.accent }))}
          onSelect={selectStock}
        />
        <section
          className="swap-column w-full min-w-0 max-desk:mx-auto max-desk:max-w-[520px]"
          aria-label="Swap tokens"
        >
          <div className="swap-box rounded-md border border-border p-5 phone:p-6">
            <div className="swap-heading mb-8 flex items-center justify-between gap-3">
              <h2 className="text-[22px] leading-[1.3] font-normal tracking-tight">Swap</h2>
              <button
                type="button"
                className={cleanButton.small}
                onClick={() => setSettingsOpen(!settingsOpen)}
                aria-expanded={settingsOpen}
                aria-controls="swap-settings"
              >
                {slippage}% slippage
              </button>
            </div>
            {settingsOpen && (
              <fieldset
                id="swap-settings"
                className="swap-settings pb-5 text-sm"
              >
                <legend className="text-muted text-base">
                  slippage tolerance
                </legend>
                <div className="mt-3 flex gap-1.5">
                  {["0.5", "1", "3"].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={cleanChip}
                      onClick={() => setSlippage(value)}
                      aria-pressed={slippage === value}
                    >
                      {value}%
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 text-base text-muted">
                  The largest price change you would accept.
                </p>
              </fieldset>
            )}
            <div className="swap-input-box rounded-md border border-border bg-surface-muted p-4 phone:p-4.5">
              <div className={caption}>
                <label htmlFor="swap-pay" className="text-base">
                  You pay
                </label>
                {canFill ? (
                  <button
                    type="button"
                    className="text-base text-muted underline decoration-dotted underline-offset-[3px] hover:text-black"
                    onClick={() => fillPercent(100)}
                    aria-label={`Use full balance: ${fmt(fromBalance!)} ${from}`}
                  >
                    Balance {fmt(fromBalance!)}
                  </button>
                ) : (
                  <span className="text-base">
                    Balance {fromBalance !== null ? fmt(fromBalance) : "—"}
                  </span>
                )}
              </div>
              <div className={amountRow}>
                <input
                  id="swap-pay"
                  className={amountText}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  aria-label={`Amount of ${from} to pay`}
                  value={amount}
                  onChange={(event) => {
                    if (/^\d*\.?\d{0,18}$/.test(event.target.value)) {
                      setAmount(event.target.value);
                      setResult(null);
                    }
                  }}
                />
                {payChip}
              </div>
              {/* min-h-8 matches the preset buttons, so the box keeps its height when they're hidden (no balance). */}
              <div className="mt-3 flex min-h-8 items-center justify-between gap-2.5">
                <p className="swap-field-note text-base text-muted">
                  {nameOf(from)}
                </p>
                {canFill && (
                  <div
                    className="flex gap-1.5"
                    role="group"
                    aria-label="Amount presets"
                  >
                    {[25, 50, 75, 100].map((percent) => (
                      <button
                        type="button"
                        key={percent}
                        className={cn(
                          cleanButton.small,
                          "min-h-8 rounded-full px-2.5 text-sm",
                        )}
                        onClick={() => fillPercent(percent)}
                      >
                        {percent === 100 ? "Max" : `${percent}%`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="relative z-[1] -my-3 flex justify-center">
              <button
                type="button"
                // Round, outlined; the white ring separates it from the pay and receive boxes.
                className="grid size-10 place-items-center rounded-full border-[1.5px] border-black bg-white text-black ring-4 ring-white transition-colors hover:bg-black hover:text-white"
                aria-label="Reverse swap direction"
                onClick={() => {
                  setFrom(to);
                  setTo(from);
                  reset();
                }}
              >
                <ArrowsDownUpIcon weight="bold" className="size-[18px]" aria-hidden="true" />
              </button>
            </div>
            <div className="swap-input-box rounded-md border border-border bg-transparent p-4 phone:p-[18px]">
              <div className={caption}>
                <span className="text-base">You receive</span>
                <span className="text-base">
                  Balance {balance(to) !== null ? fmt(balance(to)!) : "—"}
                </span>
              </div>
              <div className={amountRow}>
                <output
                  className={amountText}
                  aria-label={`Estimated ${to} received`}
                >
                  {received === null ? "—" : received.toFixed(6)}
                </output>
                {receiveChip}
              </div>
              <p className="swap-field-note mt-3 text-base text-muted">
                {nameOf(to)}
              </p>
            </div>
            <div className="swap-route flex items-center justify-between pt-6 pb-3 text-base text-muted">
              <span>Route</span>
              <span className="inline-flex items-center gap-2 text-black">
                {from} <ArrowRightIcon weight="bold" /> {to}
              </span>
            </div>
            <button
              type="button"
              className={cn(
                "swap-submit",
                cleanButton.solid,
                "mt-6 w-full justify-center",
              )}
              disabled={
                live
                  ? busy || approval.approving || !valid || insufficient
                  : demo.active && (!valid || insufficient)
              }
              onClick={
                live
                  ? () => {
                      // Review first: approval (if needed) and the swap are confirmed in the pop-up.
                      dex.reset();
                      setReviewing(true);
                    }
                  : demo.active
                    ? submitDemo
                    : idleAction
              }
            >
              {submitLabel}
            </button>
            {!live && !demo.active && (
              <button type="button" className={cn(cleanButton.outline, "mt-2.5 w-full justify-center")} onClick={demo.start}>
                Or try a demo swap
              </button>
            )}
            <p className="swap-preview-note mt-4 text-sm text-muted">
              {live
                ? `Best route across BNB Chain DEXes via KyberSwap · ${SWAP_FEE_BPS / 100}% fee · max slippage ${slippage}%${dex.gasUsd !== null ? ` · gas ≈ ${usd(dex.gasUsd)}` : ""}`
                : demo.active
                  ? `Simulated balances at live stock prices${avaxUsd ? ` · BNB ${usd(avaxUsd)}` : ""} · no real funds.`
                  : "Connect a wallet on BNB Chain to swap, or try a simulated swap."}
            </p>
            {live && dex.quoteError && hasAmount && (
              <p className={errorText} role="alert">
                No route right now: {dex.quoteError}
              </p>
            )}
            {live && dex.reverted && (
              <p className={errorText} role="alert">
                The swap reverted, probably because the price moved past your slippage. Nothing was swapped; try again.
              </p>
            )}
            {txMessage && (
              <p className={errorText} role="alert">
                {txMessage}
              </p>
            )}
            {approval.error && (
              <p className={errorText} role="alert">
                {txErrorMessage(approval.error)}
              </p>
            )}
          </div>
          {reviewing && live && dex.route && dex.amountOut !== null && (
            <ReviewSwapDialog
              from={from}
              to={to}
              pay={amount}
              payUsd={dex.route.amountInUsd ? usd(Number(dex.route.amountInUsd)) : null}
              receive={fmt(dex.amountOut)}
              receiveUsd={dex.route.amountOutUsd ? usd(Number(dex.route.amountOutUsd)) : null}
              minReceive={fmt(dex.amountOut * (1 - Number(slippage) / 100))}
              slippage={slippage}
              gasUsd={dex.gasUsd !== null ? usd(dex.gasUsd) : null}
              collectFee={`${SWAP_FEE_BPS / 100}%${from === "USDC" || to === "USDC" ? " · half to stakers" : ""}`}
              needsApproval={approval.needsApproval}
              approving={approval.approving}
              busy={busy}
              error={dex.error ?? (approval.error ? String((approval.error as Error).message).split("\n")[0] : null)}
              onApprove={approval.approve}
              onConfirm={() => { void submitLive(); }}
              onClose={() => setReviewing(false)}
            />
          )}
          {shown && (
            <SwapSuccessDialog
              key={shown.hash ?? `${shown.paid}-${shown.received}`}
              paid={shown.paid}
              received={shown.received}
              hash={shown.hash}
              onClose={() => (live ? setSubmitted(null) : setResult(null))}
            />
          )}
          <RecentTrades owner={tradesOwner} demo={demo.active} />
        </section>
      </div>
    </div>
  );
}
