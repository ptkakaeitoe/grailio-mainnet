"use client";

import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useAccount } from "wagmi";

import { useDemo } from "@/components/demo-provider";
import { cleanButton } from "@/components/clean-ui";
import { WalletEntry } from "@/components/wallet-entry";

const heroOutline = `${cleanButton.outline} lowercase desk:min-h-[58px]`;

/** Secondary hero CTA: connect when signed out, otherwise jump to the collection. */
export function HeroWalletAction() {
  const demo = useDemo();
  const { isConnected } = useAccount();

  if (isConnected || demo.active) {
    return <Link href="/collection" className={heroOutline}>your collection <span aria-hidden="true"><ArrowRightIcon weight="bold" /></span></Link>;
  }
  return <WalletEntry className={heroOutline} />;
}
