import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import { cleanLink, cn } from "@/components/clean-ui";
import { DemoFooterControls } from "@/components/demo-footer-controls";

/** Footer for pages on the clean theme (landing, packs, profile). */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border desk:mt-32">
      <div className="flex flex-wrap items-center justify-between gap-6 pt-6 pb-6 desk:gap-8">
        <Link href="/" className="wordmark text-2xl">grailio</Link>
        <nav aria-label="Footer navigation" className="order-3 flex w-full flex-wrap gap-x-[22px] gap-y-2 desk:order-none desk:w-auto desk:gap-x-[34px]">
          <Link href="/packs" className={cleanLink}>packs</Link>
          <Link href="/collection" className={cleanLink}>collection</Link>
          <Link href="/trade" className={cleanLink}>trade</Link>
          <Link href="/profile" className={cleanLink}>profile</Link>
          <Link href="/marketplace" className={cleanLink}>market</Link>
          <Link href="/info" className={cleanLink}>info</Link>
        </nav>
        <a href="https://bscscan.com" target="_blank" rel="noreferrer" className={cleanLink}>bnb chain · public beta <ArrowUpRightIcon weight="bold" /></a>
      </div>
      {/* Credit: the studio's X profile (@Blurrylogics). */}
      <p className="flex items-center gap-2.5 pb-10 text-sm text-muted">
        built by
        <a href="https://x.com/Blurrylogics" target="_blank" rel="noreferrer" className={cn(cleanLink, "text-sm")}>
          {/* The blurrylogics mark: a grey circle and a blue square. */}
          <svg viewBox="0 0 1221 512" className="h-3 w-auto shrink-0" aria-hidden="true">
            <circle cx="256" cy="256" r="256" fill="#d0d0d0" />
            <rect x="709" width="512" height="512" fill="#2665ea" />
          </svg>
          blurrylogics <ArrowUpRightIcon weight="bold" />
        </a>
      </p>
      <DemoFooterControls />
    </footer>
  );
}
