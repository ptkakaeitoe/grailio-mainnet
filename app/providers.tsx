"use client";

import { useEffect } from "react";

import { BetaAccessProvider } from "@/components/beta-access";
import { DemoProvider } from "@/components/demo-provider";
import { Toaster } from "@/components/toaster";
import { WalletProviders } from "@/lib/wallet-auth";
import { installAudioUnlock } from "@/lib/sfx";

export function Providers({ children }: { children: React.ReactNode }) {
  // Lets pack sounds play on phones (they need a tap to unlock audio first).
  useEffect(() => installAudioUnlock(), []);
  return (
    <WalletProviders>
        <BetaAccessProvider>
          <DemoProvider>{children}</DemoProvider>
          <Toaster />
        </BetaAccessProvider>
    </WalletProviders>
  );
}
