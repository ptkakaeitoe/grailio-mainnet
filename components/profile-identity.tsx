"use client";

import { LiveProfileEditor } from "@/components/live-profile-editor";
import { PointsLine } from "@/components/points-line";
import { ArrowUpRightIcon, CheckIcon, CopyIcon, LinkSimpleIcon, PencilSimpleIcon } from "@phosphor-icons/react/ssr";
import { type ReactNode, useState } from "react";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";

import { CardAvatar } from "@/components/card-avatar";
import { avatarsAbi, avatarsAddress, avatarsLive } from "@/lib/contracts";
import { EMPTY_SOCIALS, SOCIAL_NETWORKS, type Socials } from "@/lib/socials";
import { useAvatars } from "@/lib/use-avatars";
import { useNames } from "@/lib/use-names";

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const chip = "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm transition-colors hover:border-black";

/** The public path for an account: its username if it has one, else its address. */
export const profilePath = (account: string, name?: string) => `/@${name ?? account}`;

/** Username, picture, bio and socials for one account, read live. */
export function useProfile(account?: Address) {
  const list = account ? [account] : [];
  const { names, refetch: refetchName } = useNames(list);
  const { avatars, refetch: refetchAvatar } = useAvatars(list);
  const details = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: avatarsAddress, abi: avatarsAbi, functionName: "bioOf", args: [account!] },
      { address: avatarsAddress, abi: avatarsAbi, functionName: "socialsOf", args: [account!] },
    ],
    query: { enabled: avatarsLive && Boolean(account), refetchInterval: 30_000 },
  });
  const key = account?.toLowerCase() ?? "";
  const [bioRow, socialsRow] = details.data ?? [];
  return {
    name: names.get(key),
    crop: avatars.get(key),
    bio: bioRow?.status === "success" ? (bioRow.result as string) : "",
    socials: socialsRow?.status === "success" ? (socialsRow.result as Socials) : EMPTY_SOCIALS,
    /** False on a CollectProfiles deployed before socials existed. */
    socialsSupported: socialsRow?.status === "success",
    loaded: details.data !== undefined || !avatarsLive,
    refetchName,
    refetchAvatar,
    refetchDetails: details.refetch,
  };
}

/** Copies text and flips to a check for a moment; returns [copied, copy]. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard can be blocked; nothing else to do.
    }
  }
  return [copied, copy] as const;
}

/**
 * Who a wallet is: picture, @username, address (tap to copy), bio and social
 * links, with one row of actions. Its owner also gets the profile editor;
 * `actions` adds page-specific buttons (e.g. Disconnect) to that row.
 */
/** `accountActions` (export, sign out) sit on their own row under `actions`. */
export function ProfileIdentity({ account, isMe, actions, accountActions }: { account: Address; isMe: boolean; actions?: ReactNode; accountActions?: ReactNode }) {
  const profile = useProfile(account);
  const [editing, setEditing] = useState(false);
  const [copied, copy] = useCopy();
  const links = SOCIAL_NETWORKS.filter((n) => profile.socials[n.key]);
  const path = profilePath(account, profile.name);

  return (
    <section aria-label="Identity" className="mt-4 flex flex-col gap-5 phone:flex-row phone:items-start desk:mt-6">
      <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-muted text-2xl text-muted uppercase">
        <CardAvatar crop={profile.crop} sizes="160px" fallback={(profile.name ?? account.slice(2)).slice(0, 2)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-4 desk:flex-row desk:items-start desk:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <p className="truncate text-[28px] leading-[1.2] tracking-tight">{profile.name ? `@${profile.name}` : short(account)}</p>
              <PointsLine account={account} />
            </div>
            {/* The wallet address, shortened; the button copies the full one. */}
            <button type="button" className="mt-1.5 inline-flex items-center gap-1.5 rounded text-sm text-muted tabular-nums transition-colors hover:text-black" title={account} aria-label={copied === "address" ? "Wallet address copied" : "Copy wallet address"} onClick={() => copy("address", account)}>
              {short(account)} {copied === "address" ? <CheckIcon /> : <CopyIcon />}
              <span className="sr-only" role="status">{copied === "address" ? "Copied" : ""}</span>
            </button>
            {profile.bio && <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed">{profile.bio}</p>}
            {links.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {links.map((n) => (
                  <a key={n.key} className={chip} href={n.url(profile.socials[n.key])} target="_blank" rel="noopener noreferrer nofollow">
                    <span className="text-muted">{n.label}</span> @{profile.socials[n.key]} <ArrowUpRightIcon weight="bold" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-1.5 desk:items-end">
            <div className="flex flex-wrap gap-1.5 desk:justify-end">
              {isMe && avatarsLive && <button type="button" className={chip} aria-haspopup="dialog" onClick={() => setEditing(true)}><PencilSimpleIcon /> Edit profile</button>}
              {/* Same layout as the demo profile: your own page just has Edit profile and the page's actions. */}
              {!isMe && <button type="button" className={chip} onClick={() => copy("link", `${window.location.origin}${path}`)}>{copied === "link" ? <CheckIcon /> : <LinkSimpleIcon />} {copied === "link" ? "Copied" : "Copy link"}</button>}
              {actions}
            </div>
            {accountActions && <div className="flex flex-wrap gap-1.5 desk:justify-end">{accountActions}</div>}
          </div>
        </div>
        {isMe && editing && <LiveProfileEditor account={account} profile={profile} onClose={() => setEditing(false)} />}
      </div>
    </section>
  );
}
