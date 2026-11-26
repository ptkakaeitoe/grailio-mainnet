"use client";

import { XIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, isAddress, parseEther, parseUnits, zeroAddress, type Address } from "viem";
import { useAccount, useBalance, useReadContract, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";

import { cleanButton, cleanChip, cleanDialog, cleanField, cn, dialogClose, dialogFooter, dialogHeader, dialogLabel } from "@/components/clean-ui";
import { TokenIcon } from "@/components/token-icon";
import { tokenLabel } from "@/lib/stock-assets";
import { useToastedWrite, useTxToast } from "@/lib/toast";
import { TOKENS } from "@/lib/tokens";
import { txErrorMessage } from "@/lib/tx-error";

/** BNB kept back for gas when sending "Max" BNB. */
const GAS_RESERVE = parseEther("0.001");

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const trim = (raw: bigint, decimals: number) => {
  const s = formatUnits(raw, decimals);
  return s.includes(".") ? s.replace(/(\.\d{0,8})\d*$/, "$1").replace(/\.?0+$/, "") : s;
};

/**
 * Send BNB or any token you hold to another wallet. `keys` are TOKENS keys
 * (BNB, USDT, NVDA…), the ones the wallet holds.
 */
export function SendDialog({ keys, onClose }: { keys: string[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const { address } = useAccount();

  const [key, setKey] = useState(keys[0] ?? "BNB");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const token = TOKENS[key];
  const native = Boolean(token?.native);
  const decimals = token?.decimals ?? 18;

  const bnb = useBalance({ address, query: { enabled: Boolean(address) && native } });
  const erc = useReadContract({ address: native ? undefined : token?.address, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: Boolean(address) && !native } });
  const balance = native ? bnb.data?.value : erc.data;
  const spendable = balance === undefined ? undefined : native ? (balance > GAS_RESERVE ? balance - GAS_RESERVE : 0n) : balance;

  let raw = 0n;
  try { raw = amount.trim() ? parseUnits(amount.trim(), decimals) : 0n; } catch { raw = 0n; }
  const target = to.trim();
  const badAddress = target !== "" && (!isAddress(target) || target.toLowerCase() === zeroAddress);
  const toSelf = isAddress(target) && address !== undefined && target.toLowerCase() === address.toLowerCase();
  const tooMuch = spendable !== undefined && raw > spendable;

  // BNB: a plain transfer. Tokens: ERC-20 transfer (toast named by txLabelsFor).
  const bnbSend = useSendTransaction();
  const bnbReceipt = useWaitForTransactionReceipt({ hash: bnbSend.data });
  const label = `${amount || "0"} ${native ? "BNB" : tokenLabel(key)}`;
  useTxToast(
    { isPending: bnbSend.isPending, hash: bnbSend.data, confirming: bnbReceipt.isLoading, success: bnbReceipt.isSuccess, error: bnbSend.error ?? bnbReceipt.error },
    native ? { loading: `Sending ${label}`, success: `Sent ${label}` } : null,
  );
  const ercSend = useToastedWrite();
  const ercReceipt = useWaitForTransactionReceipt({ hash: ercSend.data });

  const busy = bnbSend.isPending || bnbReceipt.isLoading || ercSend.isPending || ercReceipt.isLoading;
  const done = (native ? bnbReceipt.isSuccess : ercReceipt.isSuccess && ercReceipt.data?.status === "success");
  const error = native ? bnbSend.error : ercSend.error ?? (ercReceipt.data?.status === "reverted" ? new Error("The transaction was reverted.") : null);
  const ready = Boolean(address) && isAddress(target) && !badAddress && !toSelf && raw > 0n && !tooMuch && !busy;

  useEffect(() => {
    if (!done) return;
    void bnb.refetch();
    void erc.refetch();
    // Only when a send confirms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  function send() {
    if (!ready || !token) return;
    if (native) bnbSend.sendTransaction({ to: target as Address, value: raw });
    else ercSend.writeContract({ address: token.address, abi: erc20Abi, functionName: "transfer", args: [target as Address, raw] });
  }
  function pick(k: string) {
    setKey(k);
    setAmount("");
    bnbSend.reset();
    ercSend.reset();
  }
  function dismiss() {
    if (busy) return;
    dialog.current?.close();
    onClose();
  }

  return (
    <dialog
      ref={dialog}
      className={cn(cleanDialog, "w-[min(420px,calc(100%-32px))]")}
      aria-labelledby="send-title"
      onCancel={(e) => { e.preventDefault(); dismiss(); }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <header className={dialogHeader}>
        <h2 id="send-title" className={dialogLabel}>[ send ]</h2>
        <button type="button" className={dialogClose} aria-label="Close" disabled={busy} onClick={dismiss}><XIcon className="size-[18px]" /></button>
      </header>
      <form className="flex flex-col gap-4 p-5" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Token">
          {keys.map((k) => (
            <button key={k} type="button" className={cn(cleanChip, "inline-flex items-center gap-1.5")} aria-pressed={key === k} onClick={() => pick(k)}>
              <TokenIcon symbol={k} className="size-4" /> {TOKENS[k]?.native ? "BNB" : tokenLabel(k)}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5 text-sm text-muted">
          <span>To</span>
          <input className={cleanField} placeholder="0x…" autoComplete="off" spellCheck={false} value={to} onChange={(e) => setTo(e.target.value)} />
          {badAddress && <span className="text-down">Not a valid address.</span>}
          {toSelf && <span className="text-down">That’s your own wallet.</span>}
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-muted">
          <span className="flex items-baseline justify-between gap-2">
            <span>Amount</span>
            {spendable !== undefined && (
              <button type="button" className="text-black underline-offset-4 hover:underline" onClick={() => setAmount(trim(spendable, decimals))}>
                Max {trim(spendable, decimals)}
              </button>
            )}
          </span>
          <input className={cleanField} inputMode="decimal" placeholder="0" autoComplete="off" value={amount} onChange={(e) => { if (/^\d*\.?\d{0,18}$/.test(e.target.value)) setAmount(e.target.value); }} />
          {tooMuch && <span className="text-down">More than you have{native ? " (0.001 BNB stays for gas)" : ""}.</span>}
        </label>

        {ready && <p className="text-sm">Send {label} to {short(target)}</p>}
        {error && <p className="text-sm text-down" role="alert">{txErrorMessage(error)}</p>}
        {done && <p className="text-sm text-up" role="status">Sent.</p>}

        <div className={cn(dialogFooter, "-mx-5 -mb-5 flex-col gap-2")}>
          <button type="submit" className={cn(cleanButton.solid, "h-11 w-full justify-center")} disabled={!ready}>
            {busy ? "Sending…" : "Send"}
          </button>
          <p className="text-center text-[13px] text-muted">Sends on BNB Chain. Double-check the address: transfers can’t be undone.</p>
        </div>
      </form>
    </dialog>
  );
}
