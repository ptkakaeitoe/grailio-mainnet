import Link from "next/link";

import { cleanLink } from "@/components/clean-ui";
import { DemoFooterControls } from "@/components/demo-footer-controls";
import { NetworkSwitch } from "@/components/network-switch";

/** Footer for pages on the clean theme (landing, packs, profile). */
export function SiteFooter() {
  return (
    <footer className="relative isolate mt-24 desk:mt-32">
      {/* The top glow, mirrored and fainter, rising from the bottom of the page behind the footer (globals.css). */}
      <div className="footer-glow" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-6 pt-6 pb-10 desk:gap-8">
        <Link href="/" className="wordmark text-2xl">grailio</Link>
        <nav aria-label="Footer navigation" className="order-3 flex w-full flex-wrap gap-x-[22px] gap-y-2 desk:order-none desk:w-auto desk:gap-x-[34px]">
          <Link href="/packs" className={cleanLink}>packs</Link>
          <Link href="/collection" className={cleanLink}>collection</Link>
          <Link href="/trade" className={cleanLink}>trade</Link>
          <Link href="/profile" className={cleanLink}>profile</Link>
          <Link href="/marketplace" className={cleanLink}>market</Link>
          <Link href="/info" className={cleanLink}>info</Link>
        </nav>
        {/* Testnet / Mainnet beta: the testnet app lives at NEXT_PUBLIC_TESTNET_URL. */}
        <NetworkSwitch />
      </div>
      <DemoFooterControls />
    </footer>
  );
}
