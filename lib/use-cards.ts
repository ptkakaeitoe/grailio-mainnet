"use client";

import { useDemo } from "@/components/demo-provider";
import { cardsFor } from "@/lib/cards";

/** The card set for the current mode: stocks in demo mode, BNB Chain tokens otherwise. */
export function useCards() {
  const demo = useDemo();
  return { cards: cardsFor(demo.active), demo: demo.active };
}
