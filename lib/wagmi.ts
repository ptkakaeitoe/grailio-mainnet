import { createConfig as createPrivyConfig } from "@privy-io/wagmi";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import { appChain, rpcUrl } from "@/lib/chain";

/**
 * Wallet login is Privy when NEXT_PUBLIC_PRIVY_APP_ID is set: email, Google
 * or an existing wallet, with an embedded wallet made for people who
 * don't have one. Privy supplies the connectors, so its wagmi config has none.
 *
 * Without an app ID (local development before Privy is set up) the app falls
 * back to a browser wallet (MetaMask, Trust Wallet) through wagmi's injected connector.
 * BNB Smart Chain is the only chain registered either way.
 */
export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const transports = { [appChain.id]: http(rpcUrl) };

export const privyWagmiConfig = createPrivyConfig({ chains: [appChain], transports, ssr: true });

export const injectedWagmiConfig = createConfig({
  chains: [appChain],
  connectors: [injected()],
  transports,
  ssr: true,
});
