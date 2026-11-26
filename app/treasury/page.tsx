import type { Metadata } from "next";

import { PageHeading } from "@/components/clean-ui";
import { PageShell } from "@/components/page-shell";
import { TreasuryWorkspace } from "@/components/treasury-workspace";

export const metadata: Metadata = {
  title: "Treasury — grailio",
  description: "The pack prize pool: what's held, what's owed to players, and what can be withdrawn.",
  robots: { index: false, follow: false },
};

export default function TreasuryPage() {
  return (
    <PageShell>
      <PageHeading label="treasury · owner" title="Pack pool" subtitle="in USDT." intro="Every pack's $1 lands here. What's owed to players stays locked; the rest the owner can withdraw." />
      <TreasuryWorkspace />
    </PageShell>
  );
}
