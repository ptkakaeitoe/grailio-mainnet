import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { cn, PageHeading } from "@/components/clean-ui";
import { PageShell } from "@/components/page-shell";
import { avatarsAddress, chatAddress, namesAddress, RARITY_NAMES, SHOWN_TIERS, SNOWTRACE } from "@/lib/contracts";
import { collectMarketAddress, collectPacksAddress } from "@/lib/collect-packs";
import { daoAddress, pointsAddress, DAO_VISIBLE } from "@/lib/collect-dao";
import { SWAP_ROUTER, TOKENS } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "Info — grailio",
  description: "Every action in Grailio, the contract behind it, and what it costs.",
};

type Action = {
  name: string;
  what: string;
  /** Contract + function(s) that do it. */
  call: string;
  address: string;
  cost: string;
  href?: string;
};

const CHAPTERS: { id: string; title: string; lead: string; actions: Action[] }[] = [
  {
    id: "tokens",
    title: "Tokens",
    lead: "USDC is the app's money and counts as $1. Token prices come from BNB Chain DEX pools; tokenized stocks from Atlas Oracle.",
    actions: [
      { name: "Swap", what: "Swap USDT, USDC or BNB for tokenized stocks (NVDA, AAPL, SPY and more), and back. KyberSwap routes each trade across BNB Chain DEXes for the best price. Approve a token once; your wallet signs every swap.", call: "KyberSwap router", address: SWAP_ROUTER, cost: "DEX fees + gas", href: "/trade" },
    ],
  },
  {
    id: "packs",
    title: "Packs & cards",
    lead: "Every card holds a tokenized stock. The pack design sets the risk; rarity sets how much.",
    actions: [
      { name: "Buy a pack", what: "Every pack costs $1 in USDC and earns 1 collector point. Your payment goes into the prize pool, which only sells a pack it can pay out in full.", call: "CollectPacks.buy()", address: collectPacksAddress, cost: "1 USDC", href: "/packs" },
      { name: "Open a pack", what: "The next block's hash rolls a stock from the pack's basket and a rarity. The pool swaps the card's value into that stock on PancakeSwap, checked against its Atlas price, and locks it in your card. Open within 256 blocks or it opens as the lowest rarity.", call: "CollectPacks.open()", address: collectPacksAddress, cost: "Gas only", href: "/packs" },
      { name: "Redeem a card", what: "Burns the card and sends you the tokens inside (or its USDC if it was never filled). Can't be undone.", call: "CollectPacks.redeem()", address: collectPacksAddress, cost: "Gas only", href: "/collection" },
    ],
  },
  {
    id: "market",
    title: "Marketplace",
    lead: "Cards trade peer to peer, priced in BNB or USDC. Listings stay in the seller's wallet until they sell.",
    actions: [
      { name: "List a card", what: "Approve the market once, then pick BNB or USDC, a price and how long. Nothing moves until it sells; cancel any time.", call: "CollectMarket.list()", address: collectMarketAddress, cost: "Gas only", href: "/marketplace" },
      { name: "Buy a card", what: "Pay in the listing's currency. The seller gets 99%; 1% goes to the treasury.", call: "CollectMarket.buy()", address: collectMarketAddress, cost: "1% fee", href: "/marketplace" },
    ],
  },
  {
    id: "dao",
    title: "DAO",
    lead: "Points, not a token: 1 per $1 pack. They can't be bought, sold or sent.",
    actions: [
      { name: "Propose", what: "Needs 5 points. Voting lasts 3 days.", call: "CollectDAO.propose()", address: daoAddress, cost: "Gas only", href: "/dao" },
      { name: "Vote", what: "For, Against or Abstain, weighted by the points you had when the proposal started. Signal votes during the beta.", call: "CollectDAO.vote()", address: daoAddress, cost: "Gas only", href: "/dao" },
    ],
  },
  {
    id: "community",
    title: "Community",
    lead: "Chat lives on BNB Chain. The lounge is public; each token's room is encrypted for its card holders.",
    actions: [
      { name: "Enable chat", what: "Two signatures create your chat key and authorise this device.", call: "CollectChat.register()", address: chatAddress, cost: "Free · no gas", href: "/community" },
      { name: "Post", what: "Signed in your browser, relayed on-chain. Token rooms need a card of that token to read and post.", call: "CollectChat.postFor()", address: chatAddress, cost: "Free · no gas", href: "/community" },
    ],
  },
];

/** The DAO chapter is hidden while DAO_VISIBLE is off. */
const SHOWN_CHAPTERS = CHAPTERS.filter((c) => DAO_VISIBLE || c.id !== "dao");

const CONTRACTS = [
  { name: "CollectPacks", role: "$1 packs, the USDC prize pool, and the cards (ERC-721)", address: collectPacksAddress },
  { name: "CollectMarket", role: "Card trading in BNB or USDC, non-custodial", address: collectMarketAddress },
  { name: "CollectPoints", role: "Non-transferable collector points, 1 per pack", address: pointsAddress },
  ...(DAO_VISIBLE ? [{ name: "CollectDAO", role: "Proposals and points-weighted votes", address: daoAddress }] : []),
  { name: "CollectChat", role: "On-chain chat, card-gated encrypted rooms", address: chatAddress },
  { name: "CollectNames", role: "Usernames", address: namesAddress },
  { name: "CollectProfiles", role: "Card avatars and bios", address: avatarsAddress },
  { name: "KyberSwap router", role: "Swaps on /trade", address: SWAP_ROUTER },
  ...Object.entries(TOKENS).filter(([, t]) => !t.native).map(([, t]) => ({ name: t.symbol, role: "Token", address: t.address })),
];
const NOT_DEPLOYED = "0x0000000000000000000000000000000000000000";

const NAV = [
  ["start", "Start here"],
  ...SHOWN_CHAPTERS.map((c) => [c.id, c.title]),
  ["contracts", "Contracts"],
] as const;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
// Server component: lib/use-stock-prices is client-only, so format here.
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const chapter = "mb-12 border-b border-border pb-12 last:mb-0 last:border-b-0";
const chapterLabel = "text-sm text-muted";
const chapterTitle = "mt-3.5 mb-6 text-[clamp(28px,2.7vw,40px)] leading-[1.2] font-normal tracking-[-0.02em]";
const chapterBody = "my-4 max-w-[710px] text-base leading-relaxed text-muted";
const inlineLink = "inline-flex items-center gap-1 text-black underline underline-offset-[3px]";
const rarityCell = "border-b border-border px-3 py-3.5 font-normal whitespace-nowrap first:pl-0";

export default function InfoPage() {
  return (
    <PageShell>
      <PageHeading label="info / field guide" title="How it" subtitle="works." intro="Every action, the contract behind it, and what it costs." />

      <div className="grid grid-cols-1 gap-8 border-t border-border pt-7 desk:grid-cols-[200px_minmax(0,1fr)] desk:gap-[clamp(32px,7vw,110px)] desk:pt-12">
        <aside className="self-start desk:sticky desk:top-24">
          <p className="text-sm text-muted">In this guide</p>
          <nav aria-label="Info page contents" className="mt-3 grid grid-cols-2 gap-x-5 desk:mt-5 desk:grid-cols-1">
            {NAV.map(([id, name], index) => (
              <a key={id} href={`#${id}`} className="flex gap-5 border-b border-border py-3.5 text-sm transition-colors hover:text-muted">
                <span className="text-xs text-muted tabular-nums">{String(index + 1).padStart(2, "0")}</span>{name}
              </a>
            ))}
          </nav>
          <p className="mt-7 text-xs text-muted max-desk:hidden">Built on BNB Chain · beta</p>
        </aside>

        <div className="min-w-0 max-w-[760px]">
          <section id="start" className={chapter}>
            <p className={chapterLabel}>[ 01 / start here ]</p>
            <h2 className={chapterTitle}>Three steps.</h2>
            <ol className="mt-2 mb-5 grid list-none grid-cols-1 border-t border-border phone:grid-cols-3">
              {[
                ["Connect", <>Any wallet, on BNB Smart Chain.</>],
                ["Hold a little BNB", <>It pays network gas on BNB Smart Chain.</>],
                ["Open a pack", <>Start on <Link className={inlineLink} href="/packs">/packs</Link>, or try the demo first.</>],
              ].map(([title, body], i) => (
                <li key={i} className="pt-5 pr-5">
                  <span className="block text-xs text-muted tabular-nums">0{i + 1}</span>
                  <strong className="mt-2.5 block text-xl font-normal tracking-[-0.02em]">{title}</strong>
                  <span className="mt-1.5 block text-sm leading-relaxed text-muted">{body}</span>
                </li>
              ))}
            </ol>
            <p className={chapterBody}>Public beta. Cards are collectibles backed by tokenized stocks on BNB Chain.</p>
          </section>

          {SHOWN_CHAPTERS.map((ch, ci) => (
            <section key={ch.id} id={ch.id} className={chapter}>
              <p className={chapterLabel}>[ {String(ci + 2).padStart(2, "0")} / {ch.title.toLowerCase()} ]</p>
              <h2 className={chapterTitle}>{ch.title}.</h2>
              <p className={chapterBody}>{ch.lead}</p>
              <div className="mt-3 border-t border-border">
                {ch.actions.map((action) => (
                  <article key={action.name} className="border-b border-border py-[22px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
                      <h3 className="text-[clamp(20px,1.9vw,26px)] font-normal tracking-[-0.02em]">{action.href ? <Link href={action.href} className="inline-flex items-baseline gap-2 hover:text-muted">{action.name} <span className="text-[.6em] text-muted-soft" aria-hidden="true"><ArrowUpRightIcon weight="bold" /></span></Link> : action.name}</h3>
                      <span className="rounded-full border border-border-strong px-2.5 py-1 text-xs whitespace-nowrap text-muted">{action.cost}</span>
                    </div>
                    <p className="mt-2 max-w-[620px] text-sm leading-relaxed text-muted">{action.what}</p>
                    {action.address === NOT_DEPLOYED ? (
                      <code className="mt-2.5 inline-block font-sans text-xs text-muted">{action.call} · at launch</code>
                    ) : (
                      <a className="mt-2.5 inline-block text-xs break-words text-black underline-offset-[3px] hover:underline" href={`${SNOWTRACE}/address/${action.address}`} target="_blank" rel="noreferrer">
                        <code className="font-sans">{action.call}</code>
                      </a>
                    )}
                  </article>
                ))}
              </div>
              {ch.id === "packs" && (
                <div className="my-6 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <caption className="pb-4 text-left text-[13px] text-muted">Tokens inside a card, by tier and rarity. Every $1 pack averages $0.91 of tokens.</caption>
                    <thead className="text-muted">
                      <tr><th scope="col" className={rarityCell}>Rarity</th>{SHOWN_TIERS.map((t) => <th key={t.id} scope="col" className={rarityCell}>{t.name}</th>)}</tr>
                    </thead>
                    <tbody>
                      {RARITY_NAMES.map((name, r) => (
                        <tr key={name}>
                          <th scope="row" className={cn(rarityCell, "font-medium")}>{name}</th>
                          {SHOWN_TIERS.map((t) => <td key={t.id} className={cn(rarityCell, "tabular-nums")}>{usd(t.backing[r])} <span className="ml-1 text-xs text-muted-soft">{t.odds[r]}%</span></td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}

          <section id="contracts" className={chapter}>
            <p className={chapterLabel}>[ {String(CHAPTERS.length + 2).padStart(2, "0")} / under the hood ]</p>
            <h2 className={chapterTitle}>The contracts.</h2>
            <p className={chapterBody}>All on BNB Smart Chain. Prices come from BNB Chain DEX pools (PancakeSwap v3, PancakeSwap).</p>
            <ul className="mt-3 list-none border-t border-border">
              {CONTRACTS.map((c) => (
                <li key={c.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-3.5">
                  <div><strong className="block text-[15px] font-medium">{c.name}</strong><span className="text-[13px] text-muted">{c.role}</span></div>
                  {c.address === NOT_DEPLOYED ? <span className="text-[13px] text-muted">at launch</span> : <a className="inline-flex items-center gap-1 text-[13px] text-muted tabular-nums hover:text-black" href={`${SNOWTRACE}/address/${c.address}`} target="_blank" rel="noreferrer">{short(c.address)} <ArrowUpRightIcon weight="bold" /></a>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

    </PageShell>
  );
}
