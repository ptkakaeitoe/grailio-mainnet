"use client";

import { RiskBudgetsSection } from "@/components/risk-budgets-section";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, isAddress, parseUnits, type Address } from "viem";
import { useAccount, useReadContracts, useWaitForTransactionReceipt } from "wagmi";
import { useToastedWrite } from "@/lib/toast";

import { cleanButton, cleanField, cn, pageNote, StatStrip } from "@/components/clean-ui";
import { useConnectWallet } from "@/components/beta-access";
import { SwapFeesSection } from "@/components/swap-fees-section";
import { appChain, explorerUrl } from "@/lib/chain";
import { collectMarketAbi, collectMarketAddress, collectMarketLive, collectPacksAddress, collectPacksLive, collectPacksTreasuryAbi, collectStakingAbi, collectStakingAddress, collectStakingLive } from "@/lib/collect-packs";
import { PACK_DECIMALS, PACK_TOKEN } from "@/lib/tokens";
import { txErrorMessage } from "@/lib/tx-error";

const USDT = PACK_TOKEN.address;
const money = (raw: bigint | undefined) =>
  raw === undefined ? "—" : `$${Number(formatUnits(raw, PACK_DECIMALS)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
const label = "text-sm text-muted";

/**
 * The pack contract's USDT treasury. Anyone can see the numbers and share out
 * pending revenue (staking and DAO shares); only the owner can withdraw the
 * rest or pause sales. The contract enforces all of it: a withdraw shares
 * pending revenue first and never takes what players or shares are owed.
 */
export function TreasuryWorkspace() {
  const { address, chain } = useAccount();
  const { openConnect } = useConnectWallet();

  const pack = { address: collectPacksAddress, abi: collectPacksTreasuryAbi } as const;
  const { data, refetch, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...pack, functionName: "owner" },
      { ...pack, functionName: "pendingOwner" },
      { ...pack, functionName: "paused" },
      { ...pack, functionName: "surplus" },
      { ...pack, functionName: "reserved" },
      { ...pack, functionName: "packReserve" },
      { ...pack, functionName: "pendingUsdc" },
      { ...pack, functionName: "nextPackId" },
      { ...pack, functionName: "nextCardId" },
      { address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [collectPacksAddress] },
      { ...pack, functionName: "pendingRevenue" },
      { ...pack, functionName: "distributable" },
      { ...pack, functionName: "stakingBps" },
      { ...pack, functionName: "daoBps" },
    ],
    query: { enabled: collectPacksLive, refetchInterval: 15_000 },
  });
  const get = <T,>(i: number) => (data?.[i]?.status === "success" ? (data[i].result as T) : undefined);
  const owner = get<Address>(0);
  const pendingOwner = get<Address>(1);
  const paused = get<boolean>(2);
  const surplus = get<bigint>(3);
  const reserved = get<bigint>(4);
  const packReserve = get<bigint>(5);
  const pendingUsdc = get<bigint>(6);
  const packsSold = get<bigint>(7);
  const cardsOpened = get<bigint>(8);
  const balance = get<bigint>(9);
  const pendingRevenue = get<bigint>(10);
  const distributable = get<bigint>(11);
  const stakingBps = get<number>(12);
  const daoBps = get<number>(13);
  // What the owner can take once a withdraw has shared pending revenue: the
  // surplus minus the staking and DAO cuts, minus revenue held back by the bankroll.
  const withdrawable = (() => {
    if (surplus === undefined || pendingRevenue === undefined || distributable === undefined || stakingBps === undefined || daoBps === undefined) return undefined;
    const shared = distributable * BigInt(stakingBps) / 10_000n + distributable * BigInt(daoBps) / 10_000n;
    const heldBack = (pendingRevenue > 0n ? pendingRevenue : 0n) - distributable;
    const left = surplus - shared - heldBack;
    return left > 0n ? left : 0n;
  })();
  const sharesNote = stakingBps === undefined || daoBps === undefined ? undefined
    : stakingBps + daoBps === 0 ? "No shares set: all to the owner"
    : `${stakingBps / 100}% staking · ${daoBps / 100}% DAO`;

  // Marketplace: BNB fees collect in the market contract.
  const market = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: collectMarketAddress, abi: collectMarketAbi, functionName: "owner" },
      { address: collectMarketAddress, abi: collectMarketAbi, functionName: "avaxFees" },
    ],
    query: { enabled: collectMarketLive, refetchInterval: 15_000 },
  });
  const marketOwner = market.data?.[0]?.status === "success" ? (market.data[0].result as Address) : undefined;
  const avaxFees = market.data?.[1]?.status === "success" ? (market.data[1].result as bigint) : undefined;
  const isMarketOwner = Boolean(address && marketOwner && address.toLowerCase() === marketOwner.toLowerCase());

  const isOwner = Boolean(address && owner && address.toLowerCase() === owner.toLowerCase());
  const isPendingOwner = Boolean(address && pendingOwner && pendingOwner !== "0x0000000000000000000000000000000000000000" && address.toLowerCase() === pendingOwner.toLowerCase());
  const onChain = chain?.id === appChain.id;

  // Empty until edited: then it falls back to the connected wallet.
  const [toInput, setTo] = useState<string | null>(null);
  const to = toInput ?? address ?? "";
  const [amount, setAmount] = useState("");

  const { writeContract, data: hash, isPending, error, reset } = useToastedWrite();
  const receipt = useWaitForTransactionReceipt({ hash });
  const refetchMarket = market.refetch;
  useEffect(() => {
    if (!receipt.isSuccess) return;
    void refetch();
    void refetchMarket();
  }, [receipt.isSuccess, refetch, refetchMarket]);
  // distribute() (also run by withdraw) sends USDT to staking without syncing it, so the
  // payout would only start at the next stake or claim. Sync right after it confirms.
  const syncAfter = useRef(false);
  const syncTx = useToastedWrite();
  const syncReceipt = useWaitForTransactionReceipt({ hash: syncTx.data });
  const startSync = syncTx.writeContract;
  useEffect(() => {
    if (!receipt.isSuccess || !syncAfter.current) return;
    syncAfter.current = false;
    if (collectStakingLive) startSync({ address: collectStakingAddress, abi: collectStakingAbi, functionName: "sync" });
  }, [receipt.isSuccess, startSync]);
  /** Send a revenue-sharing call, then sync staking once it confirms. */
  const share = () => { reset(); syncTx.reset(); syncAfter.current = true; };
  const busy = isPending || receipt.isLoading || syncTx.isPending || syncReceipt.isLoading;

  let amountRaw = 0n;
  try {
    amountRaw = amount.trim() ? parseUnits(amount.trim(), PACK_DECIMALS) : 0n;
  } catch {
    amountRaw = -1n;
  }
  const validTo = isAddress(to);
  const overSurplus = withdrawable !== undefined && amountRaw > withdrawable;
  const canWithdraw = isOwner && onChain && validTo && amountRaw > 0n && !overSurplus && !busy;

  if (!collectPacksLive) {
    return (
      <div className="pb-16">
        <p className="text-xl">The pack contract isn’t deployed yet.</p>
        <p className="mt-3 max-w-[560px] text-base leading-relaxed text-muted">
          Deploy it with <code className="text-black">contracts/script/DeployCollectPacks.s.sol</code>. The script writes its address into
          <code className="text-black"> deployments/56.json</code>; rebuild the app and this page shows the treasury.
        </p>
      </div>
    );
  }

  return (
    <div className="treasury-workspace pb-16">
      <StatStrip
        items={[
          { label: "Pool (USDT held)", value: money(balance) },
          { label: "Owed to players", value: money(reserved), note: `${money(packReserve)} unopened · ${money(pendingUsdc)} unfilled cards` },
          { label: "Revenue to share", value: money(distributable), note: sharesNote },
          { label: "Withdrawable", value: money(withdrawable), note: "Owner's part, after shares" },
          { label: "Sales", value: paused === undefined ? "—" : paused ? "Paused" : "Open", note: packsSold !== undefined && cardsOpened !== undefined ? `${Number(packsSold) - 1} packs · ${Number(cardsOpened) - 1} opened` : undefined },
        ]}
      />

      <div className="mt-10 grid grid-cols-1 gap-10 desk:grid-cols-2">
        <section aria-labelledby="withdraw-title">
          <h2 id="withdraw-title" className="text-xl font-normal">Withdraw USDT</h2>
          {!address ? (
            <button type="button" className={cn(cleanButton.solid, "mt-5")} onClick={openConnect}>
              Connect the owner wallet <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" />
            </button>
          ) : !isOwner ? (
            <p className="mt-3 text-base text-muted">
              Only the owner ({owner ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : "…"}) can withdraw. You’re connected as {address.slice(0, 6)}…{address.slice(-4)}.
            </p>
          ) : (
            <form
              className="mt-5 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canWithdraw) return;
                reset();
                share();
                writeContract({ ...pack, functionName: "withdraw", args: [to as Address, amountRaw] }, { onSuccess: () => setAmount(""), onError: () => { syncAfter.current = false; } });
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className={label}>Send to</span>
                <input className={cleanField} value={to} onChange={(e) => setTo(e.target.value.trim())} spellCheck={false} aria-invalid={to !== "" && !validTo} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={cn(label, "flex justify-between")}>
                  <span>Amount (USDT)</span>
                  <button type="button" className="text-black underline-offset-4 hover:underline" onClick={() => withdrawable !== undefined && setAmount(formatUnits(withdrawable, PACK_DECIMALS))}>
                    Max {money(withdrawable)}
                  </button>
                </span>
                <input className={cleanField} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={amountRaw < 0n || overSurplus} />
              </label>
              {overSurplus && <p className="text-sm text-down" role="alert">More than the withdrawable surplus.</p>}
              {!onChain && <p className="text-sm text-down" role="alert">Switch your wallet to BNB Smart Chain.</p>}
              <div className="mt-1 flex flex-wrap gap-2.5">
                <button type="submit" className={cleanButton.solid} disabled={!canWithdraw}>
                  {busy ? "Confirm in wallet…" : "Withdraw"}
                </button>
                <button
                  type="button"
                  className={cleanButton.outline}
                  disabled={!isOwner || !onChain || !validTo || busy || !withdrawable}
                  onClick={() => { share(); writeContract({ ...pack, functionName: "withdrawAll", args: [to as Address] }, { onError: () => { syncAfter.current = false; } }); }}
                >
                  Withdraw all {money(withdrawable)}
                </button>
              </div>
            </form>
          )}
        </section>

        <section aria-labelledby="revenue-title">
          <h2 id="revenue-title" className="text-xl font-normal">Revenue</h2>
          <p className="mt-3 text-base text-muted">{sharesNote ?? "…"}</p>
          {address ? (
            <button
              type="button"
              className={cn(cleanButton.outline, "mt-5")}
              disabled={!onChain || busy || !distributable}
              onClick={() => { share(); writeContract({ ...pack, functionName: "distribute" }, { onError: () => { syncAfter.current = false; } }); }}
            >
              Distribute {money(distributable)}
            </button>
          ) : null}
        </section>

        <section aria-labelledby="sales-title">
          <h2 id="sales-title" className="text-xl font-normal">Sales</h2>
          <p className="mt-3 max-w-[460px] text-base leading-relaxed text-muted">
            Pausing stops new sales. Players can still open packs they bought, or refund unopened ones for what they paid. Once every pack is opened or refunded, the whole pool is withdrawable.
          </p>
          {isOwner && (
            <button
              type="button"
              className={cn(paused ? cleanButton.solid : cleanButton.outline, "mt-5")}
              disabled={!onChain || busy || paused === undefined}
              onClick={() => { reset(); writeContract({ ...pack, functionName: paused ? "unpause" : "pause" }); }}
            >
              {paused ? "Resume sales" : "Pause sales"}
            </button>
          )}
          {isPendingOwner && (
            <button type="button" className={cn(cleanButton.solid, "mt-5")} disabled={!onChain || busy} onClick={() => { reset(); writeContract({ ...pack, functionName: "acceptOwnership" }); }}>
              Accept ownership
            </button>
          )}
        </section>
      </div>

      {collectMarketLive && (
        <section className="mt-12 border-t border-border pt-8" aria-labelledby="market-fees-title">
          <h2 id="market-fees-title" className="text-xl font-normal">Marketplace fees</h2>
          <p className="mt-3 max-w-[560px] text-base leading-relaxed text-muted">
            Fees on USDT sales go into the pack pool above as revenue. Fees on BNB sales collect in the market contract until the owner withdraws them.
          </p>
          <p className="mt-4 text-2xl tracking-[-0.02em] tabular-nums">
            {avaxFees === undefined ? "—" : `${Number(formatUnits(avaxFees, 18)).toLocaleString("en-US", { maximumFractionDigits: 6 })} BNB`}
          </p>
          {isMarketOwner ? (
            <button
              type="button"
              className={cn(cleanButton.solid, "mt-4")}
              disabled={!onChain || busy || !avaxFees || !validTo}
              onClick={() => { reset(); writeContract({ address: collectMarketAddress, abi: collectMarketAbi, functionName: "withdrawAvaxFees", args: [to as Address] }); }}
            >
              Withdraw BNB fees to {validTo ? `${to.slice(0, 6)}…${to.slice(-4)}` : "…"}
            </button>
          ) : address && marketOwner ? (
            <p className="mt-3 text-sm text-muted">Only the market owner ({marketOwner.slice(0, 6)}…{marketOwner.slice(-4)}) can withdraw these.</p>
          ) : null}
        </section>
      )}

      <SwapFeesSection />
      <RiskBudgetsSection />

      {error && <p className="mt-6 text-sm break-words text-down" role="alert">{txErrorMessage(error)}</p>}
      {syncTx.error && <p className="mt-6 text-sm break-words text-down" role="alert">Shared, but starting the staking payout failed: {txErrorMessage(syncTx.error)} It starts at the next stake or claim.</p>}
      {(syncTx.isPending || syncReceipt.isLoading) && <p className="mt-6 text-sm text-muted" role="status">Starting the staking payout…</p>}
      {receipt.isSuccess && hash && !syncTx.isPending && !syncReceipt.isLoading && (
        <p className="mt-6 text-sm" role="status">
          Done. <a className="underline underline-offset-4" href={`${explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></a>
        </p>
      )}
      {isLoading && <p className="mt-6 text-sm text-muted" role="status">Loading treasury…</p>}

      <p className={pageNote}>
        Contract <a className="underline underline-offset-4" href={`${explorerUrl}/address/${collectPacksAddress}`} target="_blank" rel="noreferrer">{collectPacksAddress.slice(0, 6)}…{collectPacksAddress.slice(-4)}</a> · tokens locked in cards can never be withdrawn.
      </p>
    </div>
  );
}
