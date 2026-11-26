import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { CardFan } from "@/components/card-fan";
import { cleanButton, cleanLink, cn } from "@/components/clean-ui";
import { HeroWalletAction } from "@/components/hero-wallet-action";
import { TokenIcon } from "@/components/token-icon";
import { HoloStockCard } from "@/components/holo-stock-card";
import { FitPackArt } from "@/components/pack-art";
import { PageShell } from "@/components/page-shell";
import { StockCardFront } from "@/components/stock-card-front";
import { FABLE_CARDS } from "@/lib/cards";
import { EDITIONS } from "@/lib/editions";

const FLOW = [
  {
    title: "Connect a wallet",
    body: "MetaMask or Trust Wallet, on BNB Smart Chain.",
  },
  {
    title: "Choose a pack",
    body: "Pick a risk tier. Every pack costs $1 in USDC.",
  },
  {
    title: "Reveal a card",
    body: "Open it for a random tokenized stock, rarity, and backing.",
  },
  { title: "Make it yours", body: "Keep, stake, list, or redeem your card." },
];

const CARD_ACTIONS = [
  {
    title: "Stake",
    body: "Lock your card in your collection.",
    href: "/collection",
    cta: "your collection",
    swatch: "bg-block-green",
  },
  {
    title: "List",
    body: "Set a price in USDC and put your card on the market.",
    href: "/marketplace",
    cta: "visit the market",
    swatch: "bg-block-salmon",
  },
  {
    title: "Redeem",
    body: "Burn your card to receive the stock tokens inside.",
    href: "/collection",
    cta: "your collection",
    swatch: "bg-block-ink",
  },
];

const MORE = [
  {
    title: "Trade the tokens",
    body: "Swap USDC or BNB for tokens that follow real share prices.",
    href: "/trade",
    cta: "start trading",
  },
  {
    title: "Join the conversation",
    body: "Meet other holders in public and token-gated rooms.",
    href: "/community",
    cta: "enter community",
  },
];

const sectionSpace = "pt-24 desk:pt-32";
const followingSectionSpace = "pt-32 desk:pt-44";
const sectionHead =
  "flex flex-col gap-6 desk:flex-row desk:items-end desk:justify-between desk:gap-8";
const sectionTitle =
  "text-[clamp(34px,calc(5.5vw_-_10px),74px)] leading-[1.06] font-normal tracking-[-0.04em]";
// Phones: buttons share the row at equal widths, labels centered, wrapping to full-width rows when they don't fit.
const buttonRow =
  "flex flex-wrap gap-3 max-desk:[&>:is(a,button)]:min-w-max max-desk:[&>:is(a,button)]:flex-1 max-desk:[&>:is(a,button)]:justify-center";
const sectionIntro =
  "max-w-[530px] text-base leading-normal text-muted desk:text-right desk:text-lg";

export default function Home() {
  return (
    <PageShell>
      {/* Fills the first screen on desktop: headline and actions left, relic cards right, ticker at the fold. */}
      <section
        id="overview"
        className="grid grid-cols-1 grid-rows-[minmax(0,1fr)_auto] desk:min-h-[calc(100svh_-_88px)]"
      >
        <div className="relative grid grid-cols-1 gap-4 py-8 desk:grid-cols-2 desk:items-center desk:gap-8 desk:pt-4">
          {/* On phones the column dissolves so the art can lead and the note can close. */}
          <div className="relative min-w-0 max-desk:contents">
            <h1 className="text-[clamp(26px,13vw,64px)] leading-[1.2] font-normal tracking-[-0.01em] desk:text-[clamp(30px,calc(min(8vw,12.5svh)_-_20px),110px)]">
              <span className="text-muted-soft">
                Trade
                <br />
                Stock You
                <br />
                Can
              </span>{" "}
              Collect.
            </h1>
            <div
              className={cn(
                buttonRow,
                "mt-[clamp(32px,6svh,56px)] max-desk:mt-2 phone:gap-4",
              )}
            >
              <Link
                href="/packs"
                className={cn(cleanButton.solid, "lowercase desk:min-h-[58px]")}
              >
                explore packs <ArrowUpRightIcon weight="bold" />
              </Link>
              <HeroWalletAction />
            </div>
            {/* Phones: a row under the headline. Desktop: CardFan draws these beside the cards instead. */}
            <div className="pointer-events-none flex items-end justify-between gap-4 text-right text-sm leading-[1.3] max-desk:order-1 desk:hidden">
              <span className="z-[1] bg-black px-2 py-1 text-white">
                [SERIES 01]
              </span>
              <p className="z-[1] bg-black px-2 py-1 text-white">
                [PUBLIC BETA]
              </p>
            </div>
          </div>
          <CardFan />
        </div>
        {/* What Grailio runs on, in the spot the price ticker used to hold (ticker hidden for now).
            Spread edge to edge on desktop. Each partner shows its own mark. */}
        <ul
          aria-label="Built with"
          className="flex list-none flex-wrap items-center gap-x-6 gap-y-2 p-0 pt-4 pb-8 text-sm text-muted desk:justify-between desk:text-base"
        >
          <li className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="relative mr-0.5 inline-flex size-2" aria-hidden="true">
              <span className="absolute inset-0 animate-ping rounded-full bg-up opacity-60 motion-reduce:animate-none" />
              <span className="relative size-2 rounded-full bg-up" />
            </span>
            Live on <TokenIcon symbol="BNB" className="size-5" /> <span className="text-black">BNB Chain</span>
          </li>
          {(
            [
              ["PRIVY", "Wallets", "Privy"],
              ["KYBER", "Swaps", "KyberSwap"],
              ["LINK", "Prices", "Chainlink"],
            ] as const
          ).map(([icon, what, who]) => (
            <li key={who} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {what} by <TokenIcon symbol={icon} className="size-5" /> <span className="text-black">{who}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Hidden for now; drop `hidden` to bring the Fable cards section back. */}
      <section
        id="cards"
        hidden
        className={sectionSpace}
        aria-labelledby="cards-title"
      >
        <div className={sectionHead}>
          <h2 id="cards-title" className={sectionTitle}>
            Fable
            <br />
            <span className="text-muted-soft">First release.</span>
          </h2>
          <div className="flex flex-col items-start desk:items-end desk:text-right">
            <p className={cn(sectionIntro, "w-full")}>
              Four designs, four rarities. <br />
              One card per pack.
            </p>
            <Link href="/packs" className={cn(cleanLink, "mt-5 lowercase")}>
              see what&apos;s inside <ArrowUpRightIcon weight="bold" />
            </Link>
          </div>
        </div>

        <ol
          className="-mx-[18px] mt-10 flex snap-x snap-mandatory scroll-px-[18px] gap-3 overflow-x-auto px-[18px] pb-4 phone:-mx-6 phone:scroll-px-6 phone:px-6 desk:mx-0 desk:mt-22 desk:px-0 desk:grid desk:grid-cols-4 desk:gap-5 desk:overflow-visible desk:pb-0"
          aria-label="The four Fable rarities"
        >
          {FABLE_CARDS.map((art) => (
            <li
              key={art.slug}
              className="w-[min(48vw,210px)] shrink-0 snap-start desk:w-auto"
            >
              <HoloStockCard
                art={art}
                sizes="(max-width: 800px) 210px, (max-width: 1200px) 18vw, 260px"
              />
              <div className="mt-4 flex justify-between text-xs tracking-[0.08em] uppercase">
                <span>{art.number} / 04</span>
                <span>{art.name}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="how-it-works"
        className={sectionSpace}
        aria-labelledby="flow-title"
      >
        {/* Two equal halves: steps on the left, the sealed/revealed pair filling the right. */}
        <div className="grid items-center gap-8 desk:grid-cols-2 desk:gap-16">
          <div>
            <h2 id="flow-title" className={sectionTitle}>
              Open one.
              <br />
              <span className="text-muted-soft">Make it yours.</span>
            </h2>
            <ol className="mt-10 grid gap-5 desk:mt-12 desk:gap-6">
              {FLOW.map((step, index) => (
                <li
                  key={step.title}
                  className="grid grid-cols-[40px_minmax(0,1fr)] gap-4 phone:grid-cols-[56px_minmax(0,1fr)]"
                >
                  <span className="pt-1 text-md tabular-nums">
                    [{String(index + 1).padStart(2, "0")}]
                  </span>
                  <div>
                    <h3 className="text-xl font-normal tracking-[-0.03em] desk:text-lg">
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-normal text-muted phone:text-base">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div className={cn(buttonRow, "mt-8 desk:mt-16")}>
              <Link
                href="/trade"
                className={cn(cleanButton.outline, "lowercase")}
              >
                try the demo <ArrowUpRightIcon weight="bold" />
              </Link>
              <Link
                href="/packs"
                className={cn(cleanButton.solid, "lowercase")}
              >
                explore packs <ArrowUpRightIcon weight="bold" />
              </Link>
            </div>
          </div>
          <div
            className="relative mx-auto mt-8 aspect-[450/440] w-full max-w-[320px] desk:mt-0 desk:max-w-[560px]"
            aria-hidden="true"
          >
            <div className="absolute top-[19%] left-[8%] w-[43%] max-w-[240px] -rotate-[14deg] shadow-[0_24px_32px_-22px_#0008]">
              <FitPackArt edition={EDITIONS[0]} />
              <span className="absolute top-full right-4 mt-4 text-sm uppercase">
                [sealed]
              </span>
            </div>
            <div className="absolute top-[11%] right-[7%] w-[43%] max-w-[240px] rotate-[12deg]">
              <StockCardFront
                art={FABLE_CARDS[2]}
                decorative
                className="w-full"
                sizes="240px"
              />
              <span className="absolute right-0 bottom-full mb-4 text-sm uppercase">
                [revealed]
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        id="your-card"
        className={followingSectionSpace}
        aria-labelledby="actions-title"
      >
        <div className={sectionHead}>
          <h2 id="actions-title" className={sectionTitle}>
            Keep it moving.
            <br />
            <span className="text-muted-soft">Your call.</span>
          </h2>
          <p className={sectionIntro}>
            Keep your card, stake it, <br />
            list it, or redeem its backing.
          </p>
        </div>
        <ul className="mt-10 grid desk:mt-14 desk:grid-cols-3 desk:gap-8">
          {CARD_ACTIONS.map((action, index) => (
            <li
              key={action.title}
              className={cn(
                "flex flex-col items-start py-6 first:pt-0 last:pb-0 desk:py-0",
                index < CARD_ACTIONS.length - 1 &&
                  "border-b border-border desk:border-r desk:border-b-0 desk:pr-8",
              )}
            >
              <div className="flex w-full items-start justify-between">
                <span className="text-md tabular-nums">[0{index + 1}]</span>
                <span
                  className={cn(
                    "mt-1 h-5 w-3.5 -rotate-[23deg]",
                    action.swatch,
                  )}
                  aria-hidden="true"
                />
              </div>
              <h3 className="mt-6 text-[clamp(30px,calc(4vw_-_10px),50px)] leading-none font-normal tracking-[-0.04em]">
                {action.title}
              </h3>
              <p className="mt-5 mb-5 max-w-[340px] text-base leading-normal text-muted">
                {action.body}
              </p>
              <Link
                href={action.href}
                className={cn(cleanLink, "mt-auto lowercase")}
              >
                {action.cta} <ArrowUpRightIcon weight="bold" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="explore"
        className={followingSectionSpace}
        aria-labelledby="explore-title"
      >
        <div className={sectionHead}>
          <h2 id="explore-title" className={sectionTitle}>
            More to explore.
          </h2>
          <p className={sectionIntro}>
            Trade the tokens or meet the people collecting them.
          </p>
        </div>
        <ul className="mt-10 grid border-y border-border py-6 desk:mt-14 desk:grid-cols-2 desk:gap-8 desk:py-7">
          {MORE.map((item, index) => (
            <li
              key={item.href}
              className={cn(
                "pt-6 first:pt-0 desk:pt-0",
                index === 0 &&
                  "border-b border-border pb-6 desk:border-r desk:border-b-0 desk:pb-0 desk:pr-8",
              )}
            >
              <Link
                href={item.href}
                className="group flex h-full min-h-[160px] flex-col items-start justify-between gap-8 desk:min-h-[180px]"
              >
                <span className="flex w-full items-start justify-between gap-4 text-[clamp(30px,3vw,44px)] leading-[1.08] tracking-[-0.03em]">
                  {item.title}
                  <ArrowUpRightIcon weight="bold"
                    className="mt-1 text-[24px] transition-transform group-hover:translate-x-1 group-hover:-translate-y-1"
                    aria-hidden="true"
                  />
                </span>
                <span className="flex flex-col gap-3 text-base leading-normal text-muted">
                  <span>{item.body}</span>
                  <span className="text-sm text-black underline underline-offset-4">
                    {item.cta}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-col items-start justify-between gap-6 desk:mt-14 desk:flex-row desk:items-end">
          <p className="max-w-[540px] text-sm leading-normal text-muted">
            BNB Smart Chain, public beta. Cards are collectibles backed by
            Tokenized stocks on BNB Chain, priced by Atlas Oracle. Not investment products.
          </p>
          <Link
            href="/packs"
            className={cn(
              cleanButton.solid,
              "lowercase max-desk:w-full max-desk:justify-center",
            )}
          >
            see the packs <ArrowUpRightIcon weight="bold" />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
