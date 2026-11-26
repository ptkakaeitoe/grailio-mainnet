"use client";

import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { DemoCollection } from "@/components/demo-collection";
import { useDemo } from "@/components/demo-provider";
import Link from "next/link";
import { StockCardFront } from "@/components/stock-card-front";
import { WalletEntry } from "@/components/wallet-entry";
import { cleanButton } from "@/components/clean-ui";
import { CollectionWelcome } from "@/components/collection-welcome";
import { cardBack, FlipCard } from "@/components/flip-card";
import { useState } from "react";
import { useAccount } from "wagmi";

import { CARD_BY_SLUG } from "@/lib/cards";
import { StockCardCollection } from "@/components/stock-card-collection";
import { RARITIES } from "@/lib/contracts";
import { collectPacksLive } from "@/lib/collect-packs";

export function CollectionPanel() {
  const demo = useDemo();
  const { address } = useAccount();
  const [flipped, setFlipped] = useState<number | null>(null);

  const owned = RARITIES.map((rarity) => ({
    rarity,
    art: CARD_BY_SLUG[rarity.slug],
    held: demo.active ? (demo.balances[`CARD:${rarity.slug}`] ?? 0) : 0,
  })).filter((entry) => entry.held > 0);

  if (demo.active) return <DemoCollection />;

  // Real wallets see their stock-backed cards; demo keeps the sample set.
  if (collectPacksLive && address && !demo.active) return <StockCardCollection />;

  // Connected before packs are on sale on mainnet: say so, and offer the demo.
  if (address && !collectPacksLive) {
    return (
      <CollectionWelcome
        label="series 01"
        title="Cards arrive at launch."
        body="Packs go on sale when Grailio launches on BNB Chain."
        action={<button type="button" className={cleanButton.solid} onClick={demo.start}>Try the demo <ArrowUpRightIcon weight="bold" /></button>}
      />
    );
  }

  if ((!address && !demo.active) || owned.length === 0) {
    return (
      <CollectionWelcome
        label="classic / series 01"
        title={address || demo.active ? "Your first find awaits." : "Your cards live here."}
        body={address || demo.active ? "Open a Fable pack." : "Connect to see them."}
        action={address || demo.active ? <Link className={cleanButton.solid} href="/packs">Explore packs <ArrowUpRightIcon weight="bold" /></Link> : <WalletEntry className={cleanButton.solid} />}
      />
    );
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-7 phone:grid-cols-[repeat(auto-fill,minmax(175px,230px))] desk:grid-cols-[repeat(auto-fill,minmax(205px,255px))] desk:gap-x-8 desk:gap-y-12">
      {owned.map(({ rarity, art, held }) => {
        const isFlipped = flipped === rarity.id;
        return (
          <li key={rarity.id} className="min-w-0">
            <FlipCard
              flipped={isFlipped}
              onToggle={() => setFlipped(isFlipped ? null : rarity.id)}
              label={`${art.ticker} ${art.name}. ${isFlipped ? "Hide" : "Show"} card details.`}
              front={<>
                <StockCardFront art={art} decorative className="size-full" sizes="(max-width: 480px) 44vw, (max-width: 800px) 30vw, 17vw" />
                {held > 1 && <span className="absolute right-1.5 bottom-[23%] rounded-[4px] bg-black px-2 py-0.5 text-xs text-white">×{held}</span>}
              </>}
              back={<>
                <span className={cardBack.row}><span>{demo.active ? "DEMO COLLECTION" : "FIELD NOTES"}</span><span>{rarity.label.toUpperCase()}</span></span>
                <span className={cardBack.title}><strong className={cardBack.name}>{art.name}</strong><span className={cardBack.sub}>{art.ticker}</span></span>
                <dl className={cardBack.meta}>
                  <div className={cardBack.item}><dt className={cardBack.dt}>Token ID</dt><dd className={cardBack.dd}>{rarity.id}</dd></div>
                  <div className={cardBack.item}><dt className={cardBack.dt}>Standard</dt><dd className={cardBack.dd}>ERC-1155</dd></div>
                  <div className={cardBack.item}><dt className={cardBack.dt}>Pull odds</dt><dd className={cardBack.dd}>{rarity.odds}</dd></div>
                  <div className={cardBack.item}><dt className={cardBack.dt}>Reward</dt><dd className={cardBack.dd}>{rarity.reward} WBNB</dd></div>
                  <div className={cardBack.item}><dt className={cardBack.dt}>Owned</dt><dd className={cardBack.dd}>×{held}</dd></div>
                </dl>
                <span className={cardBack.foot}>SERIES 01 / 04</span>
              </>}
            />
            <p className="mt-3 text-base">{art.ticker} · {art.name}</p>
          </li>
        );
      })}
    </ul>
  );
}
