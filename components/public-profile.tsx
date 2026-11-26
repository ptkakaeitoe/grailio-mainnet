"use client";

import { cardArt } from "@/lib/cards";
import { tokenAmount } from "@/lib/format-amount";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { getAddress, isAddressEqual, zeroAddress, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { cleanButton, cn } from "@/components/clean-ui";
import { HoldingsPanel } from "@/components/holdings-panel";
import { IdentityCard } from "@/components/identity-card";
import { useDemo } from "@/components/demo-provider";
import { DemoProfileIdentity } from "@/components/demo-profile-identity";
import { LiveRedeemed, ProfileCards } from "@/components/profile-cards";
import { useDemoProfile } from "@/lib/demo-profile";
import { ListingCard, listingGrid, marketGrid, marketMain, marketSide, sectionLabel, sectionTitle, sidePanel } from "@/components/market-parts";
import { ProfileIdentity } from "@/components/profile-identity";
import { TOKENS } from "@/lib/tokens";
import { namesAbi, namesAddress, namesLive, PACK_TIERS, RARITY_NAMES, SNOWTRACE } from "@/lib/contracts";
import { useStockCards } from "@/lib/use-stock-cards";
import { usd, useStockPrices } from "@/lib/use-stock-prices";

type Target = { kind: "name" | "address"; value: string };

const fmt = (n: number, digits = 6) => n.toLocaleString("en-US", { maximumFractionDigits: digits });

/** /@handle: resolves a username (or takes an address) and shows that wallet. */
export function PublicProfile({ target }: { target: Target }) {
  const byName = target.kind === "name";
  // Demo: your demo username's page shows your demo profile (it lives in this browser).
  const demo = useDemo();
  const { profile } = useDemoProfile();
  const demoMatch = demo.active && byName && profile.name === target.value;
  const { data: owner, isLoading, isError } = useReadContract({
    address: namesAddress,
    abi: namesAbi,
    functionName: "ownerOf",
    args: [target.value],
    query: { enabled: byName && namesLive },
  });

  if (demoMatch) return <DemoPublicView />;
  if (!byName) return <ProfileView account={getAddress(target.value)} />;
  if (!namesLive) return <Missing title="Usernames aren’t deployed yet." />;
  if (isLoading) return <p className="pt-10 text-sm text-muted" role="status">Looking up @{target.value}…</p>;
  if (isError) return <Missing title="Couldn’t look up this profile." body="Check your connection and reload." />;
  if (!owner || isAddressEqual(owner, zeroAddress)) {
    return <Missing title={`@${target.value} isn’t claimed yet.`} body="Claim it as your username from your profile." action={<Link className={cleanButton.solid} href="/profile">Go to your profile <ArrowUpRightIcon weight="bold" /></Link>} />;
  }
  return <ProfileView account={owner} />;
}

/** Your demo profile as a public page: picture, name, bio, links and cards. */
function DemoPublicView() {
  return (
    <div className="pt-6 pb-16 desk:pt-10">
      <h1 className="sr-only">Profile</h1>
      <DemoProfileIdentity editable={false} actions={<Link className={cn(sectionLabel, "hover:text-black")} href="/profile">[ edit ]</Link>} />
      <section className="mt-10 border-t border-border pt-8" aria-labelledby="demo-public-cards">
        <h2 id="demo-public-cards" className={cn(sectionTitle, "mb-6")}>Cards</h2>
        <ProfileCards />
      </section>
    </div>
  );
}

function ProfileView({ account }: { account: Address }) {
  const { address } = useAccount();
  const isMe = Boolean(address && isAddressEqual(address, account));
  return (
    <div className="pt-6 pb-16 desk:pt-10">
      <div className="flex items-baseline justify-end gap-3">
        <h1 className="sr-only">Profile</h1>
        <a className={cn(sectionLabel, "hover:text-black")} href={`${SNOWTRACE}/address/${account}`} target="_blank" rel="noreferrer">[ bscscan ]</a>
      </div>
      <ProfileIdentity account={account} isMe={isMe} />
      <div className={marketGrid}>
        <section className={marketMain} aria-labelledby="public-cards-title">
          <div className="mb-6 flex items-baseline justify-between gap-3">
            <h2 id="public-cards-title" className={sectionTitle}>Cards</h2>
            {isMe ? <Link className={cn(sectionLabel, "hover:text-black")} href="/collection">[ manage ]</Link> : <span className={sectionLabel}>[ series 01 ]</span>}
          </div>
          <PublicCards account={account} />
          <LiveRedeemed account={account} />
        </section>
        <aside className={marketSide}>
          <section className={cn(sidePanel, "desk:pt-10")} aria-labelledby="id-card-title">
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h2 id="id-card-title" className={sectionTitle}>ID card</h2>
              <span className={sectionLabel}>[ scan to view ]</span>
            </div>
            <IdentityCard account={account} />
          </section>
          <HoldingsPanel account={account} />
        </aside>
      </div>
    </div>
  );
}

/** Someone's cards, view only: what each holds, its value now, and whether it's listed. */
function PublicCards({ account }: { account: Address }) {
  const { cards, ready } = useStockCards(account);
  const { byTicker } = useStockPrices(60_000, "tokens");
  if (!ready) return <p className="text-sm text-muted" role="status">Loading cards…</p>;
  if (cards.length === 0) return <p className="rounded-md border border-dashed border-border-strong px-6 py-12 text-center text-sm text-muted">No cards yet.</p>;
  return (
    <ul className={listingGrid}>
      {cards.map((card) => {
        const art = cardArt(card.ticker, card.rarity, card.tier);
        if (!art) return null;
        const price = byTicker[card.ticker]?.price;
        const value = card.filled ? (price == null ? null : card.amount * price) : card.usd;
        const status = card.listPrice !== null ? `Listed · ${card.listCurrency === "BNB" ? `${fmt(card.listPrice, 4)} BNB` : usd(card.listPrice)}` : "In wallet";
        return (
          <ListingCard
            key={String(card.id)}
            art={art}
            rarity={card.rarity}
            badge={RARITY_NAMES[card.rarity]}
            title={`card #${String(card.id)}`}
            price={value == null ? "—" : usd(value)}
            details={[
              { label: "Status", value: status },
              { label: "Inside", value: card.filled ? `${tokenAmount(card.amount)} ${TOKENS[card.ticker]?.symbol ?? card.ticker}` : `${usd(card.usd)} USDT` },
              { label: "Pack", value: PACK_TIERS[card.tier]?.name ?? "—" },
            ]}
            action={card.listPrice !== null ? <Link className="text-sm underline underline-offset-4" href="/marketplace">On the market</Link> : null}
          />
        );
      })}
    </ul>
  );
}

function Missing({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="pt-6 pb-16 desk:pt-10">
      <div className="mt-4 flex flex-col items-center gap-4 rounded-md border border-dashed border-border-strong px-6 py-16 text-center">
        <p className={sectionLabel}>[ profile ]</p>
        <h1 className="text-[clamp(24px,3vw,34px)] leading-[1.15] font-normal tracking-[-0.02em]">{title}</h1>
        {body && <p className="text-sm text-muted">{body}</p>}
        {action}
      </div>
    </div>
  );
}
