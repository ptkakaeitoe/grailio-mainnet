export type Edition = {
  id: string;
  name: string;
  /** Full-bleed wrapper illustration; labels and seals are rendered by PackArt. */
  cover?: string;
  style: "classic" | "future" | "realistic";
  subtitle: string;
  description: string;
  /** Short pitch used beside the featured pack selector. */
  pitch: string;
  material: string;
  status: string;
  mark: string;
  /** Buyable now. */
  live: boolean;
  /** Shown in the pack picker but not for sale yet ("Coming soon"). */
  comingSoon?: boolean;
  /** Which PACK_TIERS entry (CollectPacks tier id) this pack sells. */
  tier: number;
  /** Risk options (tier ids), Low first. Defaults to just `tier`. */
  tiers?: number[];
  facts: string[];
};

export const EDITIONS: Edition[] = [
  {
    id: "01",
    name: "Fable",
    cover: "/art/packs/fable-cover-v1.png",
    style: "realistic",
    subtitle: "A steady glow",
    description: "The $1 pack: every card holds $0.95 of a random token.",
    pitch: "Every card holds $0.95 of a random token.",
    material: "TEXTURE / LIGHT / LIFE",
    status: "Lowest risk",
    mark: "f",
    live: true,
    tier: 0,
    tiers: [0, 1, 2],
    facts: ["$1 per pack", "Lowest risk", "$0.95 in tokens"],
  },
  {
    id: "02",
    name: "Saga",
    cover: "/art/packs/saga-cover-v1.png",
    style: "classic",
    subtitle: "Brighter pulls",
    description: "The $3 pack: every card holds $2.85 of a random token.",
    pitch: "Every card holds $2.85 of a random token.",
    material: "PAPER / INK / RELIC",
    status: "Lowest risk",
    mark: "s",
    // On sale: tier 3 is on-chain. Medium / High (6, 7) show Coming soon until added.
    live: true,
    tier: 3,
    tiers: [3, 6, 7],
    facts: ["$3 per pack", "Lowest risk", "$2.85 in tokens"],
  },
  {
    id: "03",
    name: "Mythos",
    cover: "/art/packs/mythos-cover-v1.png",
    style: "future",
    subtitle: "The big one",
    description: "The $5 pack: every card holds $4.75 of a random token.",
    pitch: "Every card holds $4.75 of a random token.",
    material: "CHROME / LIGHT / MOTION",
    status: "Lowest risk",
    mark: "✳",
    // On sale: tier 5 is on-chain. Medium / High (8, 9) show Coming soon until added.
    live: true,
    tier: 5,
    tiers: [5, 8, 9],
    facts: ["$5 per pack", "Lowest risk", "$4.75 in tokens"],
  },
];

/** The pack design that sells a given risk tier. */
export const editionForTier = (tier: number): Edition =>
  EDITIONS.find((edition) => edition.tier === tier || edition.tiers?.includes(tier)) ?? EDITIONS[0];
