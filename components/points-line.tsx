"use client";

import { zeroAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { CollectMark } from "@/components/collect-mark";
import { pointsAbi, pointsAddress } from "@/lib/collect-dao";

/** A profile's collector points (1 per pack bought): the Grailio mark and the count in an outlined pill beside the name. */
export function PointsLine({ account, demoPoints }: { account?: Address; demoPoints?: number }) {
  const live = demoPoints === undefined && Boolean(account) && pointsAddress !== zeroAddress;
  const { data } = useReadContract({
    address: pointsAddress,
    abi: pointsAbi,
    functionName: "pointsOf",
    args: account ? [account] : undefined,
    query: { enabled: live, refetchInterval: 30_000 },
  });
  const points = demoPoints ?? (data === undefined ? null : Number(data));
  if (points === null) return null;
  return (
    <p className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border pr-3 pl-2 text-base tabular-nums" aria-label={`${points} ${points === 1 ? "point" : "points"}`} title={`${points} ${points === 1 ? "point" : "points"}`}>
      {/* Just the mark, in the text colour (white on the dark theme). */}
      <CollectMark className="size-5" />
      <span aria-hidden="true">{points.toLocaleString("en-US")}</span>
    </p>
  );
}
