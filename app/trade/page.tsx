import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { SwapWorkspace } from "@/components/swap-workspace";

export const metadata: Metadata = {
  title: "Trade — grailio",
  description: "Swap USDT, USDC and BNB for tokenized stocks on BNB Chain.",
};

export default function TradePage() {
  return <PageShell><SwapWorkspace /></PageShell>;
}
