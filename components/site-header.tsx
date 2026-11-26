"use client";

import { DAO_VISIBLE } from "@/lib/collect-dao";
import { EqualsIcon, PlusIcon, WalletIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useDemo } from "@/components/demo-provider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cleanLink, cn, gutter } from "@/components/clean-ui";
import { CollectMark } from "@/components/collect-mark";
import { WalletEntry } from "@/components/wallet-entry";
import { CardAvatar } from "@/components/card-avatar";
import { GasNotice } from "@/components/gas-notice";
import { appChain } from "@/lib/chain";
import { useAccount, useSwitchChain } from "wagmi";

import { useAvatars } from "@/lib/use-avatars";
import { useWalletAuth } from "@/lib/wallet-auth";

const NAV = [
  { label: "Packs", href: "/packs" },
  { label: "Collection", href: "/collection" },
  { label: "Trade", href: "/trade" },
  { label: "Market", href: "/marketplace" },
  { label: "Community", href: "/community" },
  ...(DAO_VISIBLE ? [{ label: "DAO", href: "/dao" }] : []),
];


/** Wallet label in the header: a text link; its trailing icon hides on small screens. */
/** "connect wallet" (and "switch network"): outlined like the connected wallet button with a solid fill (the hero glow stays behind it), no hover underline. */
const walletLink = cn(cleanLink, "h-10 rounded-md border border-border-strong bg-white px-4 text-sm lowercase transition-colors after:hidden hover:border-black max-desk:[&>span+span]:hidden max-phone:[&_.wallet-word]:hidden");

/** Sign-in link, or your address (opens the profile), or a switch-network prompt. */
function HeaderWallet({ pathname }: { pathname: string }) {
  const { ready } = useWalletAuth();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const { avatars } = useAvatars(address ? [address] : []);
  const avatar = address ? avatars.get(address.toLowerCase()) : undefined;
  if (!isConnected || !address) return <WalletEntry className={walletLink} disabled={!ready} navAnchor />;
  if (chainId !== appChain.id) {
    return (
      <button type="button" className={cn(walletLink, "text-warning")} disabled={isPending} onClick={() => switchChain({ chainId: appChain.id })}>
        <span>{isPending ? "Switching…" : "Switch network"}</span>
        <span aria-hidden="true"><PlusIcon /></span>
      </button>
    );
  }
  // The address opens the profile (holdings and collection): a bordered chip with your avatar.
  return (
    <Link
      href="/profile"
      className={cn("inline-flex h-10 items-center gap-2.5 rounded-md border border-border-strong bg-transparent py-1 text-sm whitespace-nowrap transition-colors hover:border-black aria-[current=page]:border-black", avatar ? "pr-4 pl-1.5" : "px-4")}
      aria-current={pathname === "/profile" ? "page" : undefined}
      aria-label={`Profile, wallet ${address}`}
    >
      {/* Your avatar when one is set, otherwise a wallet icon. */}
      {avatar ? (
        <span className="relative size-7 shrink-0 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
          <CardAvatar crop={avatar} fallback={null} sizes="28px" />
        </span>
      ) : (
        <WalletIcon size={16} className="shrink-0 text-muted" aria-hidden="true" />
      )}
      <span>{`${address.slice(0, 6)}…${address.slice(-4)}`}</span>
    </Link>
  );
}

export function SiteHeader() {
  const demo = useDemo();
  const pathname = usePathname();
  const { isConnected, chain } = useAccount();
  const wrongNetwork =
    isConnected && chain !== undefined && chain.id !== appChain.id;
  // Small-screen menu; the toggle is hidden on wider screens.
  const [menuOpen, setMenuOpen] = useState(false);

  // Content fades out as it scrolls up under the bar: the scroll position, once a frame, drives the mask on
  // #main-content in globals.css (nothing is painted over the page, so the glow behind stays visible).
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      root.style.setProperty("--scroll-y", `${window.scrollY}px`);
      root.toggleAttribute("data-scrolled", window.scrollY > 8);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); root.removeAttribute("data-scrolled"); };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      <a className="fixed -top-24 left-4 z-[100] bg-black p-3 text-white focus:top-3" href="#main-content">Skip to content</a>
      {/* The bar never changes as you scroll; content fades out as it passes underneath (see the effect above). */}
      {/* The ::before bar is hidden unless a frosted page menu is open (globals.css .site-header). It sits on a
          pseudo-element so the header isn't a backdrop root and the phone menu can still blur the page behind it. */}
      {/* Phone menu backdrop: dims the page under the open menu; tapping anywhere on it closes the menu. */}
      <div
        aria-hidden="true"
        className={cn("fixed inset-0 z-30 bg-[rgb(0_0_0/.55)] transition-opacity duration-300 ease-out desk:hidden", menuOpen ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={() => setMenuOpen(false)}
      />
      <header className="site-header sticky top-0 z-40 pt-[env(safe-area-inset-top)] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-white/72 before:backdrop-blur-[14px] before:[clip-path:inset(0_0_100%_0)]">
        <GasNotice />
        <div className={cn("relative mx-auto flex h-[72px] items-center gap-3 phone:gap-5 desk:grid desk:h-[88px] desk:grid-cols-[1fr_auto_1fr] desk:gap-6 wide:gap-10", gutter)}>
          {/* Wordmark: the mark, "grailio" in Syne (.wordmark), and a small solid "BETA" chip in mono caps. Phones show the mark
              alone (the name stays for screen readers). */}
          <Link href="/" className="inline-flex shrink-0 items-center gap-2 desk:justify-self-start">
            <CollectMark className="size-9" />
            <span className="wordmark text-[26px] max-phone:sr-only">grailio</span>
            <span className={cn("ml-1.5 rounded-[3px] bg-black px-1.5 py-[3px] font-mono text-[10px] leading-none font-medium tracking-[0.08em] text-white uppercase max-phone:hidden")}>beta</span>
          </Link>

          {/* Phones: one frosted sheet from the top of the bar down (behind the logo and buttons, so bar and menu read as a
              single surface with no seam); it unrolls downward and rolls back up in one motion. */}
          <nav
            id="site-nav"
            aria-label="Main navigation"
            className={cn("absolute inset-x-0 top-[calc(env(safe-area-inset-top)*-1)] -z-10 flex flex-col items-start gap-[18px] border-b border-border bg-white/72 px-[18px] backdrop-blur-[14px] pt-[calc(84px+env(safe-area-inset-top))] pb-7 transition-[clip-path,visibility] phone:px-6 desk:visible desk:pointer-events-auto desk:static desk:z-auto desk:[clip-path:none] desk:flex-row desk:items-center desk:gap-5 desk:border-0 desk:bg-transparent desk:p-0 desk:backdrop-blur-none wide:gap-[34px]", menuOpen ? "visible duration-300 ease-out [clip-path:inset(0)]" : "pointer-events-none invisible duration-300 ease-[cubic-bezier(.4,0,.2,1)] [clip-path:inset(0_0_100%_0)]")}
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cleanLink}
                aria-current={item.href === pathname || pathname.startsWith(`${item.href}/`) ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {item.label.toLowerCase()}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-3 phone:gap-5 desk:justify-self-end">
            {demo.active && (
              <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-2 py-1 text-sm lowercase" onClick={demo.exit} aria-label="Exit demo mode">
                demo <XIcon />
              </button>
            )}
            <HeaderWallet pathname={pathname} />
          </div>

          <button
            type="button"
            className="-mr-1.5 inline-flex size-9 items-center justify-center text-[26px] desk:hidden"
            aria-controls="site-nav"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <XIcon /> : <EqualsIcon />}
          </button>
        </div>
      </header>

      {wrongNetwork && (
        <div className="border-b border-warning/20 bg-warning-soft">
          <div className="mx-auto max-w-6xl px-4 py-2 text-center text-xs font-medium text-warning">
            Connected to {chain.name}. Switch to BNB Smart Chain to interact with
            these contracts.
          </div>
        </div>
      )}
    </>
  );
}
