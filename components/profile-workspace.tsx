"use client";

import { ArrowUpRightIcon, ClockCounterClockwiseIcon, KeyIcon, SignOutIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";

import { cleanButton, cn } from "@/components/clean-ui";
import { useDemo } from "@/components/demo-provider";
import { HoldingsPanel } from "@/components/holdings-panel";
import { ProfileCards } from "@/components/profile-cards";
import { ActivityDrawer } from "@/components/activity-log";
import { collectPacksLive } from "@/lib/collect-packs";
import { DemoIdCard, IdentityCard } from "@/components/identity-card";
import { ShareProfileButton } from "@/components/share-profile";
import { marketGrid, marketMain, marketSide, sectionLabel, sectionTitle } from "@/components/market-parts";
import { ProfileIdentity } from "@/components/profile-identity";
import { DemoProfileIdentity } from "@/components/demo-profile-identity";
import { WalletEntry } from "@/components/wallet-entry";
import { useWalletAuth } from "@/lib/wallet-auth";
import { SNOWTRACE } from "@/lib/contracts";

/** Small outlined action, like the market's filter chips. */
const chipAction = "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm transition-colors hover:border-black";

/**
 * Wallet profile, laid out like /market: identity up top (username, picture,
 * bio and socials, editable here), then cards as the main column and holdings
 * in the side column. The public view of any wallet is /@handle.
 */
export function ProfileWorkspace() {
  const demo = useDemo();
  const { address } = useAccount();
  const { logout, exportWallet } = useWalletAuth();
  const [activityOpen, setActivityOpen] = useState(false);
  // On-chain history: live wallets only (demo has none).
  const showActivity = !demo.active && Boolean(address) && collectPacksLive;

  if (!address && !demo.active) {
    return (
      <div className="pt-6 pb-16 desk:pt-10">
        <h1 className="sr-only">Profile</h1>
        <div className="flex flex-col items-center gap-5 rounded-md border border-dashed border-border-strong px-6 py-16 text-center">
          <p className={sectionLabel}>[ wallet ]</p>
          <h2 className="text-[clamp(28px,3vw,40px)] leading-[1.15] font-normal tracking-[-0.02em]">Your profile.<br /><span className="text-muted-soft">Connect to see it.</span></h2>
          <WalletEntry className={cleanButton.solid} />
        </div>
      </div>
    );
  }

  return (
    <div className="pt-6 pb-16 desk:pt-10">
      <section aria-labelledby="profile-title">
        <div className="flex items-baseline justify-end gap-3">
          <h1 id="profile-title" className="sr-only">Profile</h1>
          {!demo.active && (
            <a className={cn(sectionLabel, "inline-flex items-center gap-1 hover:text-black")} href={`${SNOWTRACE}/address/${address}`} target="_blank" rel="noreferrer">[ bscscan <ArrowUpRightIcon className="size-3.5" weight="bold" /> ]</a>
          )}
        </div>
        {demo.active ? (
          <DemoProfileIdentity actions={<ShareProfileButton card={<DemoIdCard />} />} />
        ) : (
          address && <ProfileIdentity account={address} isMe actions={<><ShareProfileButton card={<IdentityCard account={address} />} />{showActivity && <button type="button" className={chipAction} aria-haspopup="dialog" onClick={() => setActivityOpen(true)}><ClockCounterClockwiseIcon /> Activity</button>}</>} accountActions={<>{exportWallet && <button type="button" className={chipAction} aria-haspopup="dialog" onClick={() => { void exportWallet().catch(() => {}); }}><KeyIcon /> Export wallet</button>}<button type="button" className={cn(chipAction, "text-down hover:border-down")} onClick={() => { void logout(); }}><SignOutIcon /> Sign out</button></>} />
        )}
      </section>

      <div className={marketGrid}>
        <section id="collection" className={marketMain} aria-labelledby="cards-title">
          <div className="mb-6 flex items-baseline justify-between gap-3">
            <h2 id="cards-title" className={sectionTitle}>Collection</h2>
            {/* Cards and packs have their own page; just a link there. */}
            <Link href="/collection" className={cn(sectionLabel, "inline-flex shrink-0 items-center gap-1 hover:text-black")}>[ open collection <ArrowUpRightIcon className="size-3.5" weight="bold" /> ]</Link>
          </div>
          <ProfileCards account={address} />
        </section>

        {/* Phones: holdings (and the ID card) first; the Collection box links to its own page. */}
        <aside className={cn(marketSide, "max-desk:order-first max-desk:border-t-0")}>
          <HoldingsPanel />
        </aside>
      </div>
      {activityOpen && address && <ActivityDrawer account={address} onClose={() => setActivityOpen(false)} />}
    </div>
  );
}
