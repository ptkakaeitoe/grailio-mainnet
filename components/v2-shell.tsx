"use client";

import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useConnectWallet } from "@/components/beta-access";
import { useDemo } from "@/components/demo-provider";
import { useWalletAuth } from "@/lib/wallet-auth";

const pages = ["trade", "packs", "collection", "marketplace", "community"];
const mainRoutes: Record<string, string> = { trade: "/trade", packs: "/packs", collection: "/profile", marketplace: "/marketplace", community: "/community" };

export function V2Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const demo = useDemo();
  const { openConnect } = useConnectWallet();
  const { logout } = useWalletAuth();
  const { address } = useAccount();
  const current = pathname.split("/")[2] || "trade";

  return <div className="v2-root">
    <header className="v2-header">
      <Link href="/v2/">grailio / dev</Link>
      <span>{demo.active ? "Demo" : "Beta"}</span>
      <button type="button" onClick={() => demo.active ? demo.exit() : demo.start()}>{demo.active ? "Exit demo" : "Try demo"}</button>
      {address ? <button type="button" onClick={() => { void logout(); }} title="Sign out">{`${address.slice(0, 6)}…${address.slice(-4)}`}</button> : <button type="button" onClick={openConnect}>Connect</button>}
      <Link href={mainRoutes[current] ?? "/"}>Main UI <ArrowUpRightIcon weight="bold" /></Link>
    </header>
    <nav className="v2-nav" aria-label="Development tools">{pages.map((page) => <Link key={page} href={`/v2/${page}`} aria-current={current === page ? "page" : undefined}>{page === "dao" ? "DAO" : page}</Link>)}</nav>
    <main id="main-content" onClickCapture={(event) => {
      // Keep shared panels' internal navigation within the development UI.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      const destination = Object.entries(mainRoutes).find(([, route]) => route === href)?.[0];
      if (destination) { event.preventDefault(); router.push(`/v2/${destination}`); }
    }}>{children}</main>
  </div>;
}
