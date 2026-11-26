"use client";

import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import { useState } from "react";
import { cn } from "@/components/clean-ui";
import { listingButton } from "@/components/market-parts";

/** CollectStaking.HALF_LIFE: the pool pays out half of what's in it every 7 days. */
const HALF_LIFE_DAYS = 7;
const DAYS = 30;
const kept = (days: number) => 2 ** (-days / HALF_LIFE_DAYS);

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 1 ? 4 : 2 })}`;
const pct = (n: number) => `${(n * 100).toLocaleString("en-US", { maximumFractionDigits: n < 0.01 ? 2 : 1 })}%`;

export type StakingPoolPanelProps = {
  /** USDT in the staking pool now. */
  pool: number;
  /** Stakers' share of revenue not yet distributed (joins the pool on Distribute). */
  waiting?: number;
  /** What the pool pays all stakers over the next 24 hours. */
  perDay: number;
  /** Sum of every staked card's weight, yours included. */
  totalWeight: number;
  /** Weight of your staked cards. */
  myWeight: number;
  stakedCount: number;
  /** Your unclaimed rewards, already formatted. */
  earned: string;
  claim: { onClick: () => void; disabled: boolean; label: string };
};

/**
 * Staking in the collection: the revenue pool, its payout, your share and a
 * 30-day projection of the pool (7-day half-life), then your rewards and Claim.
 */
export function StakingPoolPanel({ pool, waiting = 0, perDay, totalWeight, myWeight, stakedCount, earned, claim }: StakingPoolPanelProps) {
  const share = totalWeight > 0 ? myWeight / totalWeight : 0;
  // Total pool: what's paying out now plus stakers' revenue waiting for Distribute.
  const total = pool + waiting;
  const stats = [
    { label: "Total pool", value: usd(total), note: waiting > 0 ? `${usd(waiting)} waiting to distribute` : undefined },
    { label: "Pays out", value: `${usd(perDay)}/day` },
    { label: "Your share", value: myWeight > 0 ? pct(share) : "—", note: myWeight > 0 ? `${myWeight} of ${totalWeight} weight` : "Stake a card" },
    { label: "You earn", value: myWeight > 0 ? `${usd(perDay * share)}/day` : "—" },
  ];
  return (
    <section className="mb-6 rounded-md border border-border p-4" aria-label="Staking">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base">
            Staking{stakedCount > 0 && <span className="text-muted"> · {stakedCount} {stakedCount === 1 ? "card" : "cards"}</span>}
          </p>
          <p className="mt-1 text-xl tracking-[-0.01em]">
            <span className="tabular-nums">{earned}</span> <span className="text-sm text-muted">earned</span>
          </p>
        </div>
        {stakedCount > 0 && (
          <button type="button" className={cn(listingButton, "w-auto shrink-0 px-5")} disabled={claim.disabled} onClick={claim.onClick}>
            {claim.label}
          </button>
        )}
      </div>

      {/* Pool stats and the 30-day projection fold away; open them to see how the pool pays out. */}
      <details className="group mt-4 border-t border-border pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] text-muted transition-colors hover:text-black [&::-webkit-details-marker]:hidden">
          <span>Pool details</span>
          <CaretDownIcon aria-hidden="true" className="transition-transform group-open:rotate-180" />
        </summary>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="text-[13px] text-muted">{s.label}</dt>
              <dd className="truncate tabular-nums">{s.value}</dd>
              {s.note && <dd className="truncate text-[13px] text-muted">{s.note}</dd>}
            </div>
          ))}
        </dl>
        <PoolChart pool={total} share={share} />
        <p className="mt-2 text-[13px] text-muted">Revenue pays out over time: half every 7 days. New revenue tops the pool up.</p>
      </details>
    </section>
  );
}

/** The pool left over the next 30 days with no new revenue, hoverable by day. */
function PoolChart({ pool, share }: { pool: number; share: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 140, L = 0, R = 0, T = 8, B = 20;
  const x = (d: number) => L + (d / DAYS) * (W - L - R);
  const y = (v: number) => T + (1 - (pool > 0 ? v / pool : 0)) * (H - T - B);
  const points = Array.from({ length: DAYS + 1 }, (_, d) => [x(d), y(pool * kept(d))] as const);
  const line = points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  const area = `${line}L${x(DAYS)},${H - B}L${x(0)},${H - B}Z`;
  const day = hover ?? null;
  const left = day === null ? 0 : pool * kept(day);
  const paid = pool - left;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const d = Math.round(((e.clientX - box.left) / box.width) * DAYS);
    setHover(Math.min(DAYS, Math.max(0, d)));
  }

  return (
    <figure className="mt-3">
      <figcaption className="text-[13px]">
        <span className="tabular-nums text-foreground" aria-live="polite">
          {day === null
            ? `Paid by day 7: ${usd(pool * (1 - kept(7)))}`
            : `Day ${day} · ${usd(left)} left · ${usd(paid)} paid${share > 0 ? ` · you ${usd(paid * share)}` : ""}`}
        </span>
      </figcaption>
      <div className="relative mt-2 h-[140px]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 block size-full touch-none"
          preserveAspectRatio="none"
          role="img"
          aria-label={`The pool of ${usd(pool)} pays out half every 7 days: ${usd(pool * kept(7))} left after 7 days, ${usd(pool * kept(30))} after 30.`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* Recessive grid: half-life marks at 7, 14, 21 and 28 days. */}
          {[7, 14, 21, 28].map((d) => (
            <line key={d} x1={x(d)} x2={x(d)} y1={T} y2={H - B} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={x(0)} x2={x(DAYS)} y1={H - B} y2={H - B} stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={area} fill="var(--foreground)" fillOpacity={0.06} />
          <path d={line} fill="none" stroke="var(--foreground)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {day !== null && (
            <line x1={x(day)} x2={x(day)} y1={T} y2={H - B} stroke="var(--foreground)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* Labels and the hover marker in HTML, so the stretched SVG doesn't distort them. */}
        {[0, 7, 14, 21, 28].map((d) => (
          <span key={d} aria-hidden="true" className={cn("pointer-events-none absolute bottom-0 text-[11px] leading-none text-muted tabular-nums", d > 0 && "-translate-x-1/2")} style={{ left: `${(x(d) / W) * 100}%` }}>
            {d === 0 ? "now" : `${d}d`}
          </span>
        ))}
        {day !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-foreground"
            style={{ left: `${(x(day) / W) * 100}%`, top: `${(y(left) / H) * 100}%` }}
          />
        )}
      </div>
    </figure>
  );
}
