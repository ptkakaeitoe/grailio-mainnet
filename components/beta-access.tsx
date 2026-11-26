"use client";

import { giftAccount } from "@/lib/gift-code";
import { giftSigninMessage } from "@/lib/gift-signin";
import { XIcon } from "@phosphor-icons/react/ssr";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { useWalletAuth } from "@/lib/wallet-auth";

import { cleanButton, cleanDialog, cleanField, cn, dialogClose, dialogFooter, dialogHeader, dialogLabel } from "@/components/clean-ui";

type BetaAccess = {
  /** null while the status is loading. */
  unlocked: boolean | null;
  /** Opens the wallet modal, asking for a beta code first if needed. */
  openConnect: () => void;
  /** Gift links skip the beta code: proves this browser holds an open gift's code, then signs in. False if the gift doesn't qualify. */
  unlockWithGift: (secret: string) => Promise<boolean>;
};

const BetaAccessContext = createContext<BetaAccess>({ unlocked: null, openConnect: () => {}, unlockWithGift: async () => false });

/** Sign in through the beta gate. Use this instead of calling useWalletAuth().login directly. */
export const useConnectWallet = () => useContext(BetaAccessContext);

/**
 * Anyone can browse and use demo mode; connecting a wallet needs a beta code.
 * The code is checked on the server (/api/beta), which sets a signed httpOnly
 * cookie. Must sit inside WalletProviders.
 */
export function BetaAccessProvider({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [open, setOpen] = useState(true);
  const { ready, login, logout } = useWalletAuth();
  const { isConnected } = useAccount();
  const dialog = useRef<HTMLDialogElement>(null);
  const pendingConnect = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/beta", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { unlocked: boolean; open: boolean }) => {
        if (cancelled) return;
        setUnlocked(Boolean(data.unlocked));
        setOpen(Boolean(data.open));
      })
      .catch(() => { if (!cancelled) setUnlocked(false); });
    return () => { cancelled = true; };
  }, []);

  // Wallets can reconnect on their own (auto-reconnect, injected wallets).
  // Without a code, drop the connection.
  useEffect(() => {
    if (unlocked === false && isConnected) void logout();
  }, [unlocked, isConnected, logout]);

  // After a successful code, continue to sign-in once it's ready.
  useEffect(() => {
    if (unlocked && pendingConnect.current && ready) {
      pendingConnect.current = false;
      login();
    }
  }, [unlocked, ready, login]);

  const openConnect = useCallback(() => {
    if (unlocked) login();
    else dialog.current?.showModal();
  }, [unlocked, login]);

  // The gift code stays in the browser: it only signs a short message (lib/gift-signin).
  const unlockWithGift = useCallback(async (secret: string) => {
    try {
      const issuedAt = Math.floor(Date.now() / 1000);
      const account = giftAccount(secret);
      const signature = await account.signMessage({ message: giftSigninMessage(issuedAt) });
      const res = await fetch("/api/beta/gift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signer: account.address, issuedAt, signature }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.unlocked) return false;
      pendingConnect.current = true; // sign-in opens once ready (effect above)
      setUnlocked(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  return (
    <BetaAccessContext.Provider value={{ unlocked, openConnect, unlockWithGift }}>
      {children}
      <BetaCodeDialog
        dialog={dialog}
        open={open}
        onUnlocked={() => {
          dialog.current?.close();
          pendingConnect.current = true;
          setUnlocked(true);
        }}
      />
    </BetaAccessContext.Provider>
  );
}

function BetaCodeDialog({ dialog, open, onUnlocked }: { dialog: React.RefObject<HTMLDialogElement | null>; open: boolean; onUnlocked: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/beta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.unlocked) {
        setCode("");
        onUnlocked();
      } else setError(data.error ?? "Something went wrong. Try again.");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      className={cn(cleanDialog, "w-[min(420px,calc(100%-32px))]")}
      aria-labelledby="beta-code-title"
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <header className={dialogHeader}>
        <span className={dialogLabel}>[ private beta ]</span>
        <button type="button" className={dialogClose} aria-label="Close" onClick={close}><XIcon /></button>
      </header>
      {/* `contents`: the form's parts sit straight in the dialog's column, so its button pins to the bottom. */}
      <form onSubmit={submit} className="contents">
        <div className="p-6">
          <h2 id="beta-code-title" className="text-3xl leading-[1.15] font-light tracking-[-0.02em]">Enter your beta code.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Connecting a wallet is invite-only for now. Demo mode is open to everyone.
          </p>
          {open ? (
            <div className="mt-6 flex flex-col gap-3">
              <label htmlFor="beta-code" className="sr-only">Beta code</label>
              <input
                id="beta-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Beta code"
                required
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className={cleanField}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "beta-code-error" : undefined}
              />
              {error && <p id="beta-code-error" role="alert" className="text-sm text-black">{error}</p>}
            </div>
          ) : (
            <p className="mt-6 text-sm text-black">The beta is closed right now. Try the demo instead.</p>
          )}
        </div>
        {open && (
          <div className={cn(dialogFooter, "flex flex-col")}>
            <button type="submit" className={cn(cleanButton.solid, "justify-center lowercase")} disabled={busy || !code.trim()}>
              {busy ? "checking…" : "unlock and connect"}
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}
