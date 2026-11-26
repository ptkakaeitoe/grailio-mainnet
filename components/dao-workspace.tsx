"use client";

import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { useConnectWallet } from "@/components/beta-access";
import { cleanButton, cleanField, cn, StatStrip } from "@/components/clean-ui";
import { useDemo } from "@/components/demo-provider";
import { marketGrid, marketMain, marketSide, sectionLabel, sectionTitle, sidePanel } from "@/components/market-parts";
import { appChain } from "@/lib/chain";
import { DAO_STATES, daoAbi, daoAddress, daoLive, pointsAbi, pointsAddress, SUPPORT, type DaoState } from "@/lib/collect-dao";
import { useNowSeconds } from "@/lib/use-now";
import { txErrorMessage } from "@/lib/tx-error";

type Choice = "For" | "Against" | "Abstain";
type ProposalView = {
  id: number;
  title: string;
  body: string;
  proposer: string;
  end: number;
  state: DaoState;
  votes: Record<Choice, number>;
  quorum: number;
  myVote: Choice | null;
  myPower: number;
};

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const short = (a: string) => (a.startsWith("0x") ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const CHOICES: Choice[] = ["For", "Against", "Abstain"];
const BAR: Record<Choice, string> = { For: "bg-up", Against: "bg-down", Abstain: "bg-muted-soft" };

function timeLeft(end: number, now: number) {
  const s = end - now;
  if (s <= 0) return "ended";
  if (s < 3600) return `${Math.ceil(s / 60)}m left`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h left`;
  return `${Math.floor(s / 86_400)}d left`;
}

/** One proposal: tallies, quorum, and the vote buttons. */
function ProposalCard({ p, unit, now, busy, onVote }: { p: ProposalView; unit: string; now: number; busy: boolean; onVote: (id: number, c: Choice) => void }) {
  const total = p.votes.For + p.votes.Against + p.votes.Abstain;
  const canVote = p.state === "Active" && !p.myVote && p.myPower > 0;
  return (
    <li className="border-b border-border py-6 first:pt-0 last:border-b-0 desk:py-8 desk:first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-sm text-muted">#{p.id} · by {short(p.proposer)}</span>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-[13px]", p.state === "Passed" ? "border-up text-up" : p.state === "Defeated" ? "border-down text-down" : p.state === "Cancelled" ? "border-border text-muted" : "border-black")}>
          {p.state === "Active" ? timeLeft(p.end, now) : p.state}
        </span>
      </div>
      <h3 className="mt-2 text-xl font-normal tracking-[-0.01em]">{p.title}</h3>
      {p.body && <p className="mt-2 max-w-[640px] text-base leading-relaxed whitespace-pre-line text-muted">{p.body}</p>}

      <dl className="mt-5 grid gap-2.5">
        {CHOICES.map((c) => {
          const share = total ? (p.votes[c] / total) * 100 : 0;
          return (
            <div key={c}>
              <div className="flex justify-between text-sm">
                <dt>{c}{p.myVote === c && <span className="ml-1.5 text-muted">· your vote</span>}</dt>
                <dd className="text-muted"><span className="tabular-nums">{num(p.votes[c])}</span> {unit} · <span className="tabular-nums">{share.toFixed(0)}%</span></dd>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className={cn("h-full rounded-full", BAR[c])} style={{ width: `${share}%` }} /></div>
            </div>
          );
        })}
      </dl>
      <p className="mt-3 text-[13px] text-muted">
        Turnout {num(total)} of {num(p.quorum)} {unit} needed for quorum{total > 0 && total >= p.quorum ? " · quorum reached" : ""}.
      </p>

      {p.state === "Active" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {CHOICES.map((c) => (
            <button key={c} type="button" className={cn(c === "For" ? cleanButton.solid : cleanButton.outline, "min-w-[96px] justify-center")} disabled={!canVote || busy} onClick={() => onVote(p.id, c)}>
              {c}
            </button>
          ))}
          <span className="self-center text-sm text-muted">
            {p.myVote ? "You voted." : p.myPower > 0 ? `Your weight: ${num(p.myPower)} ${unit}` : `No ${unit} at this proposal’s start.`}
          </span>
        </div>
      )}
    </li>
  );
}

function ProposeForm({ unit, power, threshold, busy, onSubmit }: { unit: string; power: number; threshold: number; busy: boolean; onSubmit: (title: string, body: string) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const enough = power >= threshold;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !enough) return;
        onSubmit(title.trim(), body.trim());
        setTitle("");
        setBody("");
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm text-muted">
        <span>Title</span>
        <input className={cleanField} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Add a SOL card to the next series" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-muted">
        <span>Details</span>
        <textarea className={cn(cleanField, "min-h-28 py-2.5")} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What should change, and why?" />
      </label>
      <button type="submit" className={cn(cleanButton.solid, "justify-between")} disabled={!enough || !title.trim() || busy}>
        {busy ? "Submitting…" : "Submit proposal"} <ArrowUpRightIcon weight="bold" />
      </button>
      <p className="text-[13px] text-muted">{enough ? `Needs ${num(threshold)} ${unit} to propose. You have ${num(power)}.` : `You need ${num(threshold)} ${unit} to propose; you have ${num(power)}.`}</p>
    </form>
  );
}

/** Page title row, like Collection and Profile. */
function DaoHeader({ label }: { label: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pt-6 desk:pt-10">
      <h1 className="text-xl font-normal">DAO</h1>
      <span className={sectionLabel}>[ {label} ]</span>
    </div>
  );
}

function DaoLayout({ stats, proposals, form, unit, now, busy, onVote, empty }: {
  stats: { label: string; value: string; note?: string }[];
  proposals: ProposalView[];
  form: React.ReactNode;
  unit: string;
  now: number;
  busy: boolean;
  onVote: (id: number, c: Choice) => void;
  empty: string;
}) {
  const demoMode = useDemo().active;
  // Newest first: proposal ids count up as they are created.
  return (
    <div className="dao-workspace pb-16">
      <DaoHeader label={demoMode ? "demo" : "beta"} />
      <StatStrip items={stats} className="mt-6 desk:mt-8" />
      <div className={cn(marketGrid, "mt-0 border-t-0 desk:mt-0")}>
        <section className={marketMain} aria-labelledby="proposals-title">
          <div className="mb-6 flex items-baseline justify-between gap-3">
            <h2 id="proposals-title" className={sectionTitle}>Proposals</h2>
            <span className={sectionLabel}>[ {String(proposals.length).padStart(2, "0")} ]</span>
          </div>
          {proposals.length === 0 ? (
            <p className="text-xl text-muted">{empty}</p>
          ) : (
            <ul className="m-0 list-none p-0">{[...proposals].sort((a, b) => b.id - a.id).map((p) => <ProposalCard key={p.id} p={p} unit={unit} now={now} busy={busy} onVote={onVote} />)}</ul>
          )}
        </section>
        <aside className={marketSide}>
          <section className={cn(sidePanel, "desk:pt-10")} aria-labelledby="propose-title">
            <h2 id="propose-title" className={cn(sectionTitle, "mb-6")}>New proposal</h2>
            {form}
          </section>
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ demo: collector points

// Same rules as mainnet: 1 point per pack bought, 5 to propose, 10% quorum.
const DEMO_KEY = "collect-demo-dao-v2";
const DEMO_THRESHOLD = 5;
/** Points held by the simulated collectors (yours are added on top). */
const DEMO_OTHERS = 2_400;

function seedProposals(now: number, quorum: number): ProposalView[] {
  const base = { proposer: "0x8c21…3f55", quorum, myVote: null, myPower: 0 } as const;
  return [
    { ...base, id: 3, title: "Add a SOL relic to series 02", body: "Bring Solana into the next card series with its own relic art, priced from DEX pools like the others.", end: now + 2 * 86_400, state: "Active", votes: { For: 420, Against: 90, Abstain: 30 } },
    { ...base, id: 2, title: "Lower the market fee to 0.5%", body: "Cheaper resales should mean more trading on the marketplace.", end: now + 5 * 3_600, state: "Active", votes: { For: 110, Against: 135, Abstain: 0 } },
    { ...base, id: 1, title: "Weekly Legendary giveaway from the pool", body: "Use part of the pack pool surplus for one Legendary card a week.", end: now - 2 * 86_400, state: "Passed", votes: { For: 680, Against: 120, Abstain: 50 } },
  ];
}

function DemoDao() {
  const now = useNowSeconds();
  const demo = useDemo();
  // Your collector points: 1 per pack you've bought in demo.
  const power = demo.points;
  const supply = DEMO_OTHERS + power;
  const quorum = Math.ceil(supply / 10);
  const [proposals, setProposals] = useState<ProposalView[] | null>(null);

  useEffect(() => {
    let loaded: ProposalView[] | null = null;
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) loaded = JSON.parse(raw);
    } catch {
      loaded = null;
    }
    // Reading browser storage has to wait for the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProposals(loaded ?? seedProposals(Math.floor(Date.now() / 1000), Math.ceil(DEMO_OTHERS / 10)));
  }, []);
  useEffect(() => {
    if (!proposals) return;
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(proposals));
    } catch {
      // Private mode: the demo still works, it just won't persist.
    }
  }, [proposals]);

  // Ended demo proposals settle like the contract would.
  const settled = (proposals ?? []).map((p) => {
    // You vote with the points you have now (those you hadn't voted with yet).
    p = { ...p, myPower: p.myVote ? p.myPower : power };
    if (p.state !== "Active" || p.end > now) return p;
    const total = p.votes.For + p.votes.Against + p.votes.Abstain;
    return { ...p, state: (total >= p.quorum && p.votes.For > p.votes.Against ? "Passed" : "Defeated") as DaoState };
  });

  const vote = (id: number, c: Choice) =>
    setProposals((list) => (list ?? []).map((p) => (p.id === id && !p.myVote && power > 0 ? { ...p, myVote: c, myPower: power, votes: { ...p.votes, [c]: p.votes[c] + power } } : p)));
  const propose = (title: string, body: string) =>
    setProposals((list) => {
      const current = list ?? [];
      const id = Math.max(0, ...current.map((p) => p.id)) + 1;
      return [{ id, title, body, proposer: "You", end: now + 3 * 86_400, state: "Active", votes: { For: 0, Against: 0, Abstain: 0 }, quorum, myVote: null, myPower: power }, ...current];
    });

  return (
    <DaoLayout
      unit="points"
      now={now}
      busy={false}
      onVote={vote}
      proposals={settled}
      empty="Loading demo proposals…"
      stats={[
        { label: "Your points", value: num(power), note: "1 per pack · can't be sold or sent" },
        { label: "All points", value: num(supply) },
        { label: "Quorum", value: "10%", note: `${num(quorum)} points` },
        { label: "Proposals", value: String(settled.length) },
      ]}
      form={<ProposeForm unit="points" power={power} threshold={DEMO_THRESHOLD} busy={false} onSubmit={propose} />}
    />
  );
}

// ------------------------------------------------------------------ mainnet: points

function LiveDao() {
  const { address, chain } = useAccount();
  const { openConnect } = useConnectWallet();
  const onChain = chain?.id === appChain.id;
  const now = useNowSeconds();

  const base = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: daoAddress, abi: daoAbi, functionName: "proposalCount" },
      { address: daoAddress, abi: daoAbi, functionName: "proposalThreshold" },
      { address: daoAddress, abi: daoAbi, functionName: "quorumBps" },
      { address: pointsAddress, abi: pointsAbi, functionName: "totalPoints" },
    ],
    query: { refetchInterval: 15_000 },
  });
  const pick = <T,>(i: number) => (base.data?.[i]?.status === "success" ? (base.data[i].result as T) : undefined);
  const count = Number(pick<bigint>(0) ?? 0n);
  const threshold = Number(pick<bigint>(1) ?? 0n);
  const quorumBps = Number(pick<number>(2) ?? 0);
  const totalPoints = Number(pick<bigint>(3) ?? 0n);

  const { data: myPointsRaw, refetch: refetchMine } = useReadContract({
    address: pointsAddress,
    abi: pointsAbi,
    functionName: "pointsOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });
  const myPoints = Number(myPointsRaw ?? 0n);

  // Newest 20 proposals.
  const ids = Array.from({ length: Math.min(count, 20) }, (_, i) => BigInt(count - 1 - i));
  const who = address ?? "0x0000000000000000000000000000000000000000";
  const rows = useReadContracts({
    allowFailure: true,
    contracts: ids.flatMap((id) => [
      { address: daoAddress, abi: daoAbi, functionName: "proposal" as const, args: [id] as const },
      { address: daoAddress, abi: daoAbi, functionName: "state" as const, args: [id] as const },
      { address: daoAddress, abi: daoAbi, functionName: "quorumOf" as const, args: [id] as const },
      { address: daoAddress, abi: daoAbi, functionName: "voteOf" as const, args: [id, who] as const },
      { address: daoAddress, abi: daoAbi, functionName: "votingPower" as const, args: [id, who] as const },
    ]),
    query: { enabled: ids.length > 0, refetchInterval: 15_000 },
  });

  const proposals: ProposalView[] = ids.flatMap((id, i) => {
    const [p, s, q, v, w] = rows.data?.slice(i * 5, i * 5 + 5) ?? [];
    if (p?.status !== "success" || s?.status !== "success") return [];
    const prop = p.result as { proposer: string; end: bigint; forVotes: bigint; againstVotes: bigint; abstainVotes: bigint; title: string; body: string };
    const mine = v?.status === "success" ? Number(v.result) : 0;
    return [{
      id: Number(id),
      title: prop.title,
      body: prop.body,
      proposer: address && prop.proposer.toLowerCase() === address.toLowerCase() ? "You" : prop.proposer,
      end: Number(prop.end),
      state: DAO_STATES[Number(s.result)] ?? "Active",
      votes: { For: Number(prop.forVotes), Against: Number(prop.againstVotes), Abstain: Number(prop.abstainVotes) },
      quorum: q?.status === "success" ? Number((q.result as readonly [bigint, bigint])[1]) : 0,
      myVote: mine === 0 ? null : (["Against", "For", "Abstain"] as const)[mine - 1],
      myPower: address && w?.status === "success" ? Number(w.result) : 0,
    }];
  });

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const busy = isPending || receipt.isLoading;
  const refetchBase = base.refetch;
  const refetchRows = rows.refetch;
  useEffect(() => {
    if (!receipt.isSuccess) return;
    void refetchBase();
    void refetchRows();
    void refetchMine();
  }, [receipt.isSuccess, refetchBase, refetchRows, refetchMine]);

  return (
    <>
      <DaoLayout
        unit="points"
        now={now}
        busy={busy || !onChain}
        onVote={(id, c) => { reset(); writeContract({ address: daoAddress, abi: daoAbi, functionName: "vote", args: [BigInt(id), SUPPORT[c]] }); }}
        proposals={proposals}
        empty={base.isLoading ? "Loading proposals…" : "No proposals yet. Earn points by opening packs, then propose."}
        stats={[
          { label: "Your points", value: address ? num(myPoints) : "—", note: "1 per $1 pack · can't be sold or sent" },
          { label: "All points", value: num(totalPoints) },
          { label: "Quorum", value: `${quorumBps / 100}%`, note: "of points at the proposal’s start" },
          { label: "Proposals", value: String(count) },
        ]}
        form={
          address ? (
            <ProposeForm unit="points" power={myPoints} threshold={threshold} busy={busy || !onChain} onSubmit={(t, b) => { reset(); writeContract({ address: daoAddress, abi: daoAbi, functionName: "propose", args: [t, b] }); }} />
          ) : (
            <button type="button" className={cn(cleanButton.solid, "w-full justify-between")} onClick={openConnect}>Connect wallet <ArrowUpRightIcon weight="bold" /></button>
          )
        }
      />
      {error && <p className="-mt-12 mb-12 text-sm break-words text-down" role="alert">{txErrorMessage(error)}</p>}
      {address && !onChain && <p className="-mt-12 mb-12 text-sm text-down" role="alert">Switch your wallet to BNB Smart Chain.</p>}
    </>
  );
}

// ------------------------------------------------------------------ page

export function DaoWorkspace() {
  const demo = useDemo();
  if (demo.active) return <DemoDao />;
  if (daoLive) return <LiveDao />;
  return (
    <div className="pb-16">
      <DaoHeader label="opening at launch" />
      <div className={cn(marketGrid, "desk:mt-8")}>
        <section className={marketMain}>
          <h2 className={cn(sectionTitle, "mb-6")}>How voting works</h2>
          <ul className="grid gap-3 text-base leading-relaxed text-muted">
            <li><strong className="font-normal text-black">Points, not a token.</strong> Every $1 pack you buy earns 1 point. Points can’t be bought, sold or sent.</li>
            <li><strong className="font-normal text-black">Points are votes.</strong> Propose ideas and vote For, Against or Abstain, weighted by your points.</li>
            <li><strong className="font-normal text-black">No last-minute buying.</strong> A vote counts the points you had when the proposal started.</li>
          </ul>
        </section>
        <section className={cn(marketSide, sidePanel, "flex flex-col items-start gap-3 desk:pt-10")}>
          <h2 className={sectionTitle}>Opening at launch</h2>
          <p className="text-base leading-relaxed text-muted">Until then, try the DAO in demo mode with simulated STONK.</p>
          <button type="button" className={cn(cleanButton.solid, "mt-2")} onClick={demo.start}>Try the demo DAO <ArrowUpRightIcon weight="bold" /></button>
          <Link href="/packs" className="text-sm underline underline-offset-4">See the packs</Link>
        </section>
      </div>
    </div>
  );
}
