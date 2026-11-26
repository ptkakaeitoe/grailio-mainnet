"use client";

import { useQuery } from "@tanstack/react-query";
import { collectPacksLive } from "@/lib/collect-packs";

/** Unopened packs per tier (from /api/tier-usage), for the risk budgets. Null until loaded. */
export function useTierUsage(): Record<number, number> | null {
  const { data } = useQuery({
    queryKey: ["tier-usage"],
    enabled: collectPacksLive,
    refetchInterval: 15_000,
    queryFn: async () => {
      const res = await fetch("/api/tier-usage", { cache: "no-store" });
      if (!res.ok) throw new Error("tier usage unavailable");
      const body = (await res.json()) as { unopened: Record<string, number> };
      return Object.fromEntries(Object.entries(body.unopened).map(([k, v]) => [Number(k), v])) as Record<number, number>;
    },
  });
  return data ?? null;
}
