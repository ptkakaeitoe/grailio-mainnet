import { useReadContracts } from "wagmi";

import { namesAbi, namesAddress, namesLive } from "@/lib/contracts";

/** Usernames must match CollectNames.isValid. */
export const NAME_PATTERN = /^[a-z0-9_]{3,16}$/;

/** On-chain usernames for a set of wallets, keyed by lowercase address. */
export function useNames(accounts: string[]) {
  const unique = [...new Set(accounts.map((a) => a.toLowerCase()))].sort();
  const { data, refetch } = useReadContracts({
    allowFailure: true,
    contracts: unique.map((a) => ({ address: namesAddress, abi: namesAbi, functionName: "nameOf" as const, args: [a as `0x${string}`] as const })),
    query: { enabled: namesLive && unique.length > 0, refetchInterval: 30_000 },
  });
  const names = new Map<string, string>();
  unique.forEach((a, i) => {
    const row = data?.[i];
    if (row?.status === "success" && row.result) names.set(a, row.result as string);
  });
  return { names, refetch };
}
