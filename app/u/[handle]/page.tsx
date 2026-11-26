import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress } from "viem";

import { PageShell } from "@/components/page-shell";
import { PublicProfile } from "@/components/public-profile";
import { NAME_PATTERN } from "@/lib/use-names";

/**
 * A public profile, served at /@handle (see the rewrite in next.config.ts).
 * The segment is a CollectNames username or, for wallets without one, an
 * address.
 */
function parse(raw: string) {
  const value = decodeURIComponent(raw).replace(/^@/, "");
  if (isAddress(value)) return { kind: "address" as const, value };
  const name = value.toLowerCase();
  return NAME_PATTERN.test(name) ? { kind: "name" as const, value: name } : null;
}

export async function generateMetadata(props: PageProps<"/u/[handle]">): Promise<Metadata> {
  const target = parse((await props.params).handle);
  if (!target) return { title: "Profile not found — grailio" };
  const label = target.kind === "name" ? `@${target.value}` : `${target.value.slice(0, 6)}…${target.value.slice(-4)}`;
  return {
    title: `${label} — grailio`,
    description: `${label}'s cards, holdings and links on grailio.`,
  };
}

export default async function HandlePage(props: PageProps<"/u/[handle]">) {
  const target = parse((await props.params).handle);
  if (!target) notFound();
  return (
    <PageShell>
      <PublicProfile target={target} />
    </PageShell>
  );
}
