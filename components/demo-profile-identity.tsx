"use client";

import { PointsLine } from "@/components/points-line";
import { ArrowUpRightIcon, PencilSimpleIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CardAvatar } from "@/components/card-avatar";
import { AvatarEditor } from "@/components/community-profile";
import { cleanButton, cleanDrawerRight, cleanField, cn, dialogClose, dialogLabel } from "@/components/clean-ui";
import { useDemo } from "@/components/demo-provider";
import { MAX_BIO } from "@/lib/contracts";
import { useDemoProfile, type DemoProfile } from "@/lib/demo-profile";
import { cleanHandle, SOCIAL_NETWORKS, validHandle, type Socials } from "@/lib/socials";
import { NAME_PATTERN } from "@/lib/use-names";

const chip = "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm transition-colors hover:border-black";

/**
 * The demo wallet's identity: picture, @username, bio and socials, edited in
 * a modal and saved in this browser. Same rules as the on-chain profile
 * contracts, which take over once they're deployed.
 */
export function DemoProfileIdentity({ actions, editable = true }: { actions?: ReactNode; editable?: boolean }) {
  const { profile } = useDemoProfile();
  const demo = useDemo();
  const [editing, setEditing] = useState(false);
  const links = SOCIAL_NETWORKS.filter((n) => profile.socials[n.key]);
  const crop = profile.avatar ? { ...profile.avatar, tokenId: 0n } : undefined;

  return (
    <section aria-label="Identity" className="mt-4 flex flex-col gap-5 phone:flex-row phone:items-start desk:mt-6">
      <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-muted text-2xl text-muted uppercase">
        <CardAvatar crop={crop} sizes="160px" fallback={(profile.name || "demo").slice(0, 2)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-4 desk:flex-row desk:items-start desk:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <p className="truncate text-[28px] leading-[1.2] tracking-tight">{profile.name ? `@${profile.name}` : "Demo wallet"}</p>
              <PointsLine demoPoints={demo.points} />
            </div>
            {profile.bio && <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed">{profile.bio}</p>}
            {links.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {links.map((n) => (
                  <a key={n.key} className={chip} href={n.url(profile.socials[n.key])} target="_blank" rel="noopener noreferrer nofollow">
                    <span className="text-muted">{n.label}</span> @{profile.socials[n.key]} <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5 desk:justify-end">
            {editable && <button type="button" className={chip} aria-haspopup="dialog" onClick={() => setEditing(true)}><PencilSimpleIcon /> Edit profile</button>}
            {actions}
          </div>
        </div>
      </div>
      {editing && <DemoProfileEditor profile={profile} onClose={() => setEditing(false)} />}
    </section>
  );
}

/** The dialog frame every profile editor uses: a label, a close button, the form. */
export function ProfileModal({ onClose, busy = false, children }: { onClose: () => void; busy?: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  // Slide back out to the right, then unmount (matches the .side-drawer transition).
  function dismiss() {
    if (busy) return;
    dialog.current?.close();
    window.setTimeout(onClose, 340);
  }
  return (
    <dialog
      ref={dialog}
      className={cn(cleanDrawerRight, "w-[min(420px,calc(100vw-16px))] flex-col open:flex")}
      aria-labelledby="edit-profile-title"
      onCancel={(e) => { e.preventDefault(); dismiss(); }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white py-2 pr-3 pl-5">
        <h2 id="edit-profile-title" className={dialogLabel}>[ edit profile ]</h2>
        <button type="button" className={dialogClose} aria-label="Close" onClick={dismiss}><XIcon className="size-[18px]" /></button>
      </header>
      <div className="flex flex-1 flex-col px-5 pt-5">{children}</div>
    </dialog>
  );
}

/** The editor's form: groups split by hairlines, the Save bar pinned to the bottom. */
export const editorForm = "flex flex-1 flex-col gap-6";
/** A group after the first: picture, then name and bio, then socials. */
export const editorGroup = "flex flex-col gap-4 border-t border-border pt-6";
/** Save (and any error) pinned to the bottom of the drawer while the fields scroll. */
export function EditorFooter({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-3 border-t border-border bg-white px-5 py-4">{children}</div>;
}

export const editorLabel = "flex flex-col gap-1.5 text-sm text-muted";
const label = editorLabel;
/** Compact field: 40px tall, so the whole form fits a phone screen. */
export const editorField = cn(cleanField, "h-10 text-black");
const field = editorField;

/** A text field with "@" inside it, so every box lines up with its label. */
export function HandleInput({ value, invalid, maxLength, onChange }: { value: string; invalid: boolean; maxLength?: number; onChange: (value: string) => void }) {
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true">@</span>
      <input className={cn(field, "pl-7")} value={value} maxLength={maxLength} autoComplete="off" spellCheck={false} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

/** One form: picture, username, bio and socials, saved together. */
function DemoProfileEditor({ profile, onClose }: { profile: DemoProfile; onClose: () => void }) {
  const { update } = useDemoProfile();
  const demo = useDemo();
  const cards = demo.cards.map((c) => ({ id: BigInt(c.id), ticker: c.ticker, rarity: c.rarity, tier: c.tier }));
  const [avatar, setAvatar] = useState<DemoProfile["avatar"]>(profile.avatar);
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [socials, setSocials] = useState<Socials>(profile.socials);

  const nameOk = name === "" || NAME_PATTERN.test(name);
  const bioSize = new TextEncoder().encode(bio.trim()).length;
  const badSocial = SOCIAL_NETWORKS.filter((n) => !validHandle(n, socials[n.key]));
  const valid = nameOk && bioSize <= MAX_BIO && badSocial.length === 0;


  return (
    <ProfileModal onClose={onClose}>
      <form className={editorForm} onSubmit={(e) => { e.preventDefault(); if (!valid) return; update({ avatar, name, bio: bio.trim(), socials }); onClose(); }}>
        {cards.length > 0 ? (
          // Pick a card, drag to frame it, zoom: saved with the form.
          <AvatarEditor
            key={avatar ? "set" : "none"}
            cards={cards}
            current={avatar ? { ...avatar, tokenId: (cards.find((c) => c.ticker === avatar.ticker && c.rarity === avatar.rarity && c.tier === avatar.tier) ?? cards.find((c) => c.ticker === avatar.ticker))?.id ?? 0n } : undefined}
            nfts={false}
            onSaved={() => {}}
            // Saved locally as JSON, so keep the card's art and framing but not its bigint id.
            onChange={(p) => setAvatar({ ticker: p.ticker, rarity: p.rarity, tier: p.tier, x: p.x, y: p.y, zoom: p.zoom })}
            onClear={() => setAvatar(null)}
          />
        ) : (
          <span className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-muted text-xl text-muted uppercase">
            <CardAvatar crop={avatar ?? undefined} sizes="192px" fallback={(name || "demo").slice(0, 2)} />
          </span>
        )}

        <div className={editorGroup}>
          <label className={label}>
            <span>Username</span>
            <HandleInput value={name} maxLength={16} invalid={!nameOk} onChange={(v) => setName(v.toLowerCase().replace(/[^a-z0-9_]/g, ""))} />
            {!nameOk && <span className="text-down">3–16 letters, numbers or _</span>}
          </label>
          <label className={label}>
            <span className="flex justify-between"><span>Bio</span><span className={cn("tabular-nums", bioSize > MAX_BIO && "text-down")}>{bioSize}/{MAX_BIO}</span></span>
            <textarea rows={3} className={cn(field, "h-auto resize-none py-2")} value={bio} onChange={(e) => setBio(e.target.value)} />
          </label>
        </div>

        <div className={editorGroup}>
          {SOCIAL_NETWORKS.map((n) => {
            const bad = !validHandle(n, socials[n.key]);
            return (
              <label key={n.key} className={label}>
                <span>{n.label}</span>
                <HandleInput value={socials[n.key]} invalid={bad} onChange={(v) => setSocials((s) => ({ ...s, [n.key]: cleanHandle(v) }))} />
                {bad && <span className="text-down">{n.hint}</span>}
              </label>
            );
          })}
        </div>

        <EditorFooter>
          <button type="submit" className={cn(cleanButton.solid, "h-11 w-full justify-center")} disabled={!valid}>Save</button>
        </EditorFooter>
      </form>
    </ProfileModal>
  );
}
