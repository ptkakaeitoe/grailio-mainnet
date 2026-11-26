"use client";

import { useDemo } from "@/components/demo-provider";
import { cardsFor } from "@/lib/cards";

/** The card set (the same stocks in demo and live). */
export function useCards() {
  const demo = useDemo();
  return { cards: cardsFor(demo.active), demo: demo.active };
}
