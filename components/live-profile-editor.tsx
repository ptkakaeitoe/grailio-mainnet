"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { CardAvatar } from "@/components/card-avatar";
import { cleanButton, cn } from "@/components/clean-ui";
import { AvatarEditor } from "@/components/community-profile";
import { EditorFooter, editorField, editorForm, editorGroup, editorLabel, HandleInput, ProfileModal } from "@/components/demo-profile-identity";
import { avatarsAbi, avatarsAddress, avatarsLive, MAX_BIO, namesAbi, namesAddress, namesLive } from "@/lib/contracts";
import { cleanHandle, SOCIAL_NETWORKS, validHandle, type Socials } from "@/lib/socials";
import { showToast } from "@/lib/toast";
import { txErrorMessage } from "@/lib/tx-error";
import type { CardAvatarCrop } from "@/lib/use-avatars";
import { NAME_PATTERN } from "@/lib/use-names";
import { useStockCards } from "@/lib/use-stock-cards";

/** The picked card by token id: several cards can share a coin, and each one has its own art. */
type Pick = { id: bigint; ticker: string; x: number; y: number; zoom: number };
type Profile = {
  name?: string;
  crop?: CardAvatarCrop;
  bio: string;
  socials: Socials;
  socialsSupported: boolean;
  refetchName: () => unknown;
  refetchAvatar: () => unknown;
  refetchDetails: () => unknown;
};

/**
 * The on-chain profile editor, laid out like the demo one: picture, username,
 * bio and socials in one form with one Save. Save sends only what changed,
 * one transaction after another (name, details and picture live in separate
 * contracts).
 */
export function LiveProfileEditor({ account, profile, onClose }: { account: Address; profile: Profile; onClose: () => void }) {
  const { cards, ready } = useStockCards(account);
  const pickable = cards.map((c) => ({ id: c.id, ticker: c.ticker, rarity: c.rarity, tier: c.tier }));
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [pick, setPick] = useState<Pick | null>(null);
  const [removePicture, setRemovePicture] = useState(false);
  const [name, setName] = useState(profile.name ?? "");
  const [bio, setBio] = useState(profile.bio);
  const [socials, setSocials] = useState<Socials>(profile.socials);
  const [step, setStep] = useState<{ at: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameChanged = namesLive && name !== "" && name !== (profile.name ?? "");
  const nameOk = name === "" || NAME_PATTERN.test(name);
  const { data: holder, isFetching: checkingName } = useReadContract({
    address: namesAddress,
    abi: namesAbi,
    functionName: "ownerOf",
    args: [name],
    query: { enabled: nameChanged && nameOk },
  });
  const nameTaken = nameChanged && holder !== undefined && !/^0x0{40}$/i.test(holder) && holder.toLowerCase() !== address?.toLowerCase();

  const bioSize = new TextEncoder().encode(bio.trim()).length;
  const badSocial = SOCIAL_NETWORKS.filter((n) => !validHandle(n, socials[n.key]));
  const detailsChanged = bio.trim() !== profile.bio || (profile.socialsSupported && SOCIAL_NETWORKS.some((n) => socials[n.key] !== profile.socials[n.key]));
  const pickedCard = pick ? pickable.find((c) => c.id === pick.id) : undefined;
  const pictureChanged = avatarsLive && (removePicture ? Boolean(profile.crop) : Boolean(pickedCard));
  const valid = nameOk && !nameTaken && bioSize <= MAX_BIO && badSocial.length === 0;
  const changed = nameChanged || detailsChanged || pictureChanged;
  const busy = step !== null;

  async function save() {
    if (!client || !valid || !changed) return;
    // Each call is its own transaction; send them in order and wait for each.
    const calls: { run: () => Promise<`0x${string}`>; after: () => unknown }[] = [];
    if (nameChanged) calls.push({ run: () => writeContractAsync({ address: namesAddress, abi: namesAbi, functionName: "setName", args: [name] }), after: profile.refetchName });
    if (detailsChanged) {
      calls.push({
        run: () => profile.socialsSupported
          ? writeContractAsync({ address: avatarsAddress, abi: avatarsAbi, functionName: "setDetails", args: [bio.trim(), socials] })
          : writeContractAsync({ address: avatarsAddress, abi: avatarsAbi, functionName: "setBio", args: [bio.trim()] }),
        after: profile.refetchDetails,
      });
    }
    if (pictureChanged) {
      calls.push({
        run: () => removePicture || !pickedCard || !pick
          ? writeContractAsync({ address: avatarsAddress, abi: avatarsAbi, functionName: "clearAvatar" })
          : writeContractAsync({ address: avatarsAddress, abi: avatarsAbi, functionName: "setAvatar", args: [pickedCard.id, pick.x, pick.y, pick.zoom] }),
        after: profile.refetchAvatar,
      });
    }
    setError(null);
    try {
      for (let i = 0; i < calls.length; i++) {
        setStep({ at: i + 1, of: calls.length });
        const hash = await calls[i].run();
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The transaction was reverted.");
        void calls[i].after();
      }
      showToast({ kind: "success", title: "Profile saved" });
      onClose();
    } catch (e) {
      setError(txErrorMessage(e as Error));
    } finally {
      setStep(null);
    }
  }

  return (
    <ProfileModal busy={busy} onClose={onClose}>
      <form className={editorForm} onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {avatarsLive && ready && pickable.length > 0 ? (
          // Pick a card, drag to frame it, zoom: saved with the form.
          <AvatarEditor
            key={removePicture ? "none" : "set"}
            cards={pickable}
            current={removePicture ? undefined : profile.crop}
            nfts={false}
            onSaved={() => {}}
            onChange={(p) => { setRemovePicture(false); setPick(p); }}
            onClear={() => { setPick(null); setRemovePicture(true); }}
          />
        ) : (
          <span className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-muted text-xl text-muted uppercase">
            <CardAvatar crop={profile.crop} sizes="192px" fallback={(name || account.slice(2)).slice(0, 2)} />
          </span>
        )}

        <div className={editorGroup}>
          {namesLive && (
            <label className={editorLabel}>
              <span>Username</span>
              <HandleInput value={name} maxLength={16} invalid={!nameOk || nameTaken} onChange={(v) => setName(v.toLowerCase().replace(/[^a-z0-9_]/g, ""))} />
              {!nameOk ? <span className="text-down">3–16 letters, numbers or _</span> : nameTaken ? <span className="text-down">That name is taken.</span> : nameChanged && checkingName ? <span>Checking…</span> : null}
            </label>
          )}
          <label className={editorLabel}>
            <span className="flex justify-between"><span>Bio</span><span className={cn("tabular-nums", bioSize > MAX_BIO && "text-down")}>{bioSize}/{MAX_BIO}</span></span>
            <textarea rows={3} className={cn(editorField, "h-auto resize-none py-2")} value={bio} disabled={busy} onChange={(e) => setBio(e.target.value)} />
          </label>
        </div>

        {profile.socialsSupported && (
          <div className={editorGroup}>
            {SOCIAL_NETWORKS.map((n) => {
              const bad = !validHandle(n, socials[n.key]);
              return (
                <label key={n.key} className={editorLabel}>
                  <span>{n.label}</span>
                  <HandleInput value={socials[n.key]} invalid={bad} onChange={(v) => setSocials((s) => ({ ...s, [n.key]: cleanHandle(v) }))} />
                  {bad && <span className="text-down">{n.hint}</span>}
                </label>
              );
            })}
          </div>
        )}

        <EditorFooter>
          {error && <p className="text-sm break-words text-down" role="alert">{error}</p>}
          <button type="submit" className={cn(cleanButton.solid, "h-11 w-full justify-center")} disabled={!valid || !changed || busy || checkingName}>
            {step ? (step.of > 1 ? `Saving ${step.at} of ${step.of}…` : "Saving…") : "Save"}
          </button>
        </EditorFooter>
      </form>
    </ProfileModal>
  );
}
