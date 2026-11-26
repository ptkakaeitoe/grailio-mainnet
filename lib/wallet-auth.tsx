"use client";

import { PrivyProvider, useExportWallet, useFundWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider, useSetActiveWallet } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WagmiProvider, useAccount, useConnect, useDisconnect } from "wagmi";

import { appChain } from "@/lib/chain";
import { injectedWagmiConfig, privyAppId, privyWagmiConfig, walletConnectProjectId } from "@/lib/wagmi";

/**
 * One way to sign in and out, whatever powers it (Privy, or a browser wallet
 * in local development). Components call this instead of a wallet library.
 */
export type WalletAuth = {
  /** False until the login system has loaded. */
  ready: boolean;
  /** Still loading, or signed in but the wallet isn't attached yet: don't offer "sign in" meanwhile. */
  restoring?: boolean;
  /** The sign-in window is open. */
  modalOpen?: boolean;
  /** Opens sign-in. Go through useConnectWallet (beta gate) rather than calling this directly. */
  login: () => void;
  logout: () => Promise<void>;
  /** Opens a top-up for this wallet (card or exchange), when supported. */
  fund?: (address: string, amountAvax: string) => Promise<void>;
  /** True for wallets made by Privy for email/social sign-ins. */
  embedded: boolean;
  /**
   * Privy-made wallets only: opens Privy's export pop-up to copy the private
   * key into another wallet (e.g. MetaMask). The key stays in Privy's own
   * secure frame on a separate domain; the app never sees it.
   */
  exportWallet?: () => Promise<void>;
};

const WalletAuthContext = createContext<WalletAuth>({ ready: false, login: () => {}, logout: async () => {}, embedded: false });
export const useWalletAuth = () => useContext(WalletAuthContext);

function PrivyAuth({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, user, connectWallet, isModalOpen } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  // True from Sign out until Privy has finished, so auto-reconnect doesn't re-attach the wallet meanwhile.
  const signingOut = useRef(false);
  const { fundWallet } = useFundWallet();
  // The wallet to use: the account's main wallet if it's connected here, else the Privy-made one, else any.
  const primary = user?.wallet?.address?.toLowerCase();
  const preferred = wallets.find((w) => w.address.toLowerCase() === primary) ?? wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];
  // Signed in to Privy but no wallet in wagmi (e.g. after a reload): make one active, or the
  // app shows "connect" while Privy refuses a second login ("user is already logged in").
  useEffect(() => {
    if (ready && authenticated && walletsReady && !isConnected && preferred && !signingOut.current) void setActiveWallet(preferred).catch(() => {});
  }, [ready, authenticated, walletsReady, isConnected, preferred, setActiveWallet]);
  const { exportWallet } = useExportWallet();
  const embeddedAddress = user?.wallet?.walletClientType === "privy" ? user.wallet.address : null;
  const embedded = Boolean(user?.wallet && user.wallet.walletClientType === "privy");
  // Stable functions, so effects that depend on them don't re-run every render.
  // A brand-new account is signed in a few seconds before Privy finishes making its wallet.
  const restoring = !ready || (authenticated && !isConnected);
  const value = useMemo<WalletAuth>(() => ({
    ready,
    restoring,
    modalOpen: isModalOpen,
    // Already signed in: reconnect the wallet instead of logging in again.
    login: () => {
      if (!authenticated) login();
      else if (preferred) void setActiveWallet(preferred).catch(() => {});
      else connectWallet();
    },
    // Instant sign-out: drop the wallet from the app now, let Privy finish in the background.
    logout: async () => {
      signingOut.current = true;
      disconnect();
      try {
        await logout();
      } finally {
        signingOut.current = false;
      }
    },
    fund: async (address, amount) => {
      await fundWallet({ address, options: { chain: appChain, amount, asset: "native-currency" } });
    },
    embedded,
    exportWallet: embeddedAddress ? () => exportWallet({ address: embeddedAddress }) : undefined,
  }), [ready, restoring, isModalOpen, authenticated, login, preferred, setActiveWallet, connectWallet, disconnect, logout, fundWallet, embedded, exportWallet, embeddedAddress]);
  return <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>;
}

function InjectedAuth({ children }: { children: ReactNode }) {
  const { connect, connectors, isPending } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const value = useMemo<WalletAuth>(() => ({
    ready: !isPending,
    restoring: isPending,
    modalOpen: isPending,
    login: () => {
      const injectedConnector = connectors[0];
      if (injectedConnector) connect({ connector: injectedConnector, chainId: appChain.id });
    },
    logout: async () => { await disconnectAsync(); },
    embedded: false,
  }), [isPending, connectors, connect, disconnectAsync]);
  return <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>;
}

/** Wallet, query and login providers for the whole app. */
export function WalletProviders({ children }: { children: ReactNode }) {
  // One client per browser session; creating it in state keeps it from being shared across requests during SSR.
  const [queryClient] = useState(() => new QueryClient());

  if (!privyAppId) {
    return (
      <WagmiProvider config={injectedWagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <InjectedAuth>{children}</InjectedAuth>
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["email", "google", "wallet"],
        appearance: {
          theme: "light",
          accentColor: "#000000",
          landingHeader: "Sign in to Grailio",
          loginMessage: "Use your email or Google account and we’ll make a wallet for you, or connect the wallet you already have.",
          showWalletLoginFirst: false,
          walletList: ["detected_ethereum_wallets", "metamask", "coinbase_wallet", "rainbow", "wallet_connect"],
        },
        // Grailio shows its own confirm screens (Review swap, pack and market confirms)
        // before anything is signed, so Privy's sign/approve pop-ups are hidden.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
        defaultChain: appChain,
        supportedChains: [appChain],
        ...(walletConnectProjectId ? { walletConnectCloudProjectId: walletConnectProjectId } : {}),
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={privyWagmiConfig}>
          <PrivyAuth>{children}</PrivyAuth>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
