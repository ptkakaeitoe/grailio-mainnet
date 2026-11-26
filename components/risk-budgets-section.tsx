"use client";

import { PACK_TIERS } from "@/lib/contracts";
import { heldPerPack, packsLeft, slotsFor, TIER_BUDGETS } from "@/lib/tier-budget";
import { useTierUsage } from "@/lib/use-tier-usage";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Treasury page: each risky tier's share of the pool deposit, what's held right now and how many can still sell. */
export function RiskBudgetsSection() {
  const usage = useTierUsage();
  const tiers = Object.keys(TIER_BUDGETS).map(Number).sort((a, b) => a - b);
  const total = tiers.reduce((sum, id) => sum + TIER_BUDGETS[id], 0);
  const cell = "border-b border-border py-2.5 pr-3 text-sm tabular-nums";
  return (
    <section className="mt-12 border-t border-border pt-8" aria-labelledby="risk-budgets-title">
      <h2 id="risk-budgets-title" className="text-xl font-normal">Risk budgets</h2>
      <p className="mt-3 max-w-[560px] text-base leading-relaxed text-muted">
        Medium and High packs hold back their top payout until opened, then the rest comes back to the pool. The app limits each risk to its share of the {usd(total)} deposit; Low risk holds nothing. Change the shares in <code className="text-sm">lib/tier-budget.ts</code>.
      </p>
      <div className="mt-5 max-w-[640px] overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[13px] text-muted">
              <th scope="col" className={cell}>Pack</th>
              <th scope="col" className={cell}>Budget</th>
              <th scope="col" className={cell}>Per pack</th>
              <th scope="col" className={cell}>Unopened</th>
              <th scope="col" className={cell}>Held now</th>
              <th scope="col" className={cell}>Left</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((id) => {
              const unopened = usage?.[id] ?? 0;
              const held = heldPerPack(id);
              return (
                <tr key={id}>
                  <td className={cell}>{PACK_TIERS[id]?.name ?? `Tier ${id}`}</td>
                  <td className={cell}>{usd(TIER_BUDGETS[id])}</td>
                  <td className={cell}>{usd(held)}</td>
                  <td className={cell}>{usage ? `${unopened} / ${slotsFor(id)}` : "…"}</td>
                  <td className={cell}>{usage ? usd(unopened * held) : "…"}</td>
                  <td className={cell}>{usage ? packsLeft(id, unopened) : "…"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
