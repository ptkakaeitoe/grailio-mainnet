"use client";

import { ArrowBendUpLeftIcon, ArrowUpIcon, ArrowUpRightIcon, CaretLeftIcon, LockIcon, MagnifyingGlassIcon, UsersIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { WalletEntry } from "@/components/wallet-entry";
import { LiveProfileEditor } from "@/components/live-profile-editor";
import { useProfile } from "@/components/profile-identity";
import type { Address } from "viem";
import { CardAvatar } from "@/components/card-avatar";
import { TokenIcon } from "@/components/token-icon";
import { AvatarEditor, Bio, UsernameForm } from "@/components/community-profile";

import { cardArt } from "@/lib/cards";
import { buildRoomList, canEnterRoom } from "@/lib/chat-rooms";
import { StockCardFront } from "@/components/stock-card-front";
import { avatarsLive, chatAddress, namesLive, RARITY_NAMES, SNOWTRACE } from "@/lib/contracts";
import { useAvatars, type CardAvatarCrop } from "@/lib/use-avatars";
import { useNames } from "@/lib/use-names";
import { useCollectCardsOf } from "@/lib/use-collect-market";
import { useChat, useRoomMessages, type ChatMessage, type ChatRoom } from "@/lib/use-chat";
import { cleanButton, cleanDialog, cleanDrawerLeft, cleanDrawerRight, cleanField, cn, dialogClose } from "@/components/clean-ui";
import { usd, useStockPrices } from "@/lib/use-stock-prices";

/**
 * Community on CollectChat: every message is an event on BNB Chain.
 * The lounge (and any pack room) is public and pinned on top; each stock's room
 * is encrypted so only holders of a card of that stock can read, and the
 * contract only lets them post. Room ↔ stock mapping: lib/chat-rooms.ts.
 * Posting is gasless via the relay.
 */

const ICONS = { back: CaretLeftIcon, search: MagnifyingGlassIcon, members: UsersIcon, send: ArrowUpIcon, close: XIcon, reply: ArrowBendUpLeftIcon, lock: LockIcon };
type IconName = keyof typeof ICONS;
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const Glyph = ICONS[name];
  return <Glyph style={{ width: size, height: size }} />;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export function ago(time: number, now: number) {
  const s = Math.max(0, Math.floor(now / 1000) - time);
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86_400)}d`;
}
/** Briefly highlights a message jumped to from a reply (message-flash keyframes in globals.css). */
const FLASH = "animate-[message-flash_1.4s_ease-out]";
/** Reply / dismiss under a message; on desktop pointers they appear on hover or focus. */
const messageAction = "flex min-w-11 items-center justify-center gap-1 rounded-md text-xs text-muted-soft transition-[opacity,color] hover:bg-surface-muted hover:text-black desk:min-w-[34px] desk:pointer-fine:opacity-0 desk:pointer-fine:group-hover/message:opacity-100 desk:pointer-fine:group-focus-within/message:opacity-100";

/** Matches /trade's watchlist and swap: hairline rules, square-ish corners, light type, bracketed labels. Phones show one pane at a time; from 801px it is two columns. */
export const ui = {
  label: "text-base text-muted",
  row: "flex w-full items-center gap-3 rounded-md border border-border px-3 py-3 text-left transition-colors hover:border-black aria-[current=true]:border-black",
  symbol: "grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-lg",
  /** Compact room row so every room fits above the profile footer without scrolling. */
  roomRow: "flex w-full min-w-0 items-center gap-2.5 rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-black aria-[current=true]:border-black",
  empty: "flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center",
  emptyTitle: "text-[clamp(28px,3vw,40px)] leading-[1.15] font-light tracking-[-0.02em] [&>span]:text-muted-soft",
  iconButton: "grid size-10 shrink-0 place-items-center rounded-md border border-border-strong text-black transition-colors hover:border-black disabled:cursor-not-allowed disabled:opacity-35",
  avatar: "grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-xs text-muted uppercase",
  /** Shared by the composer and the rooms footer so their rules line up: a 48px row, then one note line. */
  composerArea: "shrink-0 pt-4 pb-[max(8px,env(safe-area-inset-bottom))]",
  note: "mt-2 text-sm text-muted",
  dialog: `${cleanDialog} w-[min(440px,calc(100%-32px))] max-desk:mt-auto max-desk:mb-0 max-desk:max-h-[85dvh] max-desk:w-full max-desk:rounded-b-none max-desk:pb-[env(safe-area-inset-bottom)]`,
  dialogHeader: "flex items-center justify-between border-b border-border px-5 py-4",
  /** Profiles slide in from the left, members from the right: see-through panels like the nav, floating 8px off the edges (`.side-drawer` in globals.css). */
  drawer: `${cleanDrawerLeft} w-[min(420px,calc(100vw-16px))]`,
  drawerRight: `${cleanDrawerRight} w-[min(380px,calc(100vw-16px))]`,
};
export const pad = (n: number) => String(n).padStart(2, "0");

export function CommunityWorkspace() {
  const chat = useChat();
  const { isConnected: connected } = useAccount();
  // Cards you hold per token: the same count the chat contract checks for each room.
  const myCards = useCollectCardsOf();
  const held: Record<string, number> = {};
  for (const c of myCards.cards) held[c.ticker] = (held[c.ticker] ?? 0) + 1;
  const { byTicker: prices } = useStockPrices(60_000, "tokens");
  const [roomKey, setRoomKey] = useState("room:0");
  const [mobileChat, setMobileChat] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [roomMembers, setRoomMembers] = useState<string[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const profileDialog = useRef<HTMLDialogElement>(null);
  const membersDialog = useRef<HTMLDialogElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const feed = useRef<HTMLDivElement>(null);

  // Lounge and pack rooms on top, then one room per stock (rooms you can enter first, then by ticker).
  const entries = buildRoomList(chat.rooms, held);
  const entry = entries.find((e) => e.key === roomKey) ?? entries[0];
  const room: ChatRoom | undefined = entry?.room;
  const ticker = entry?.ticker ?? null;
  const gated = ticker !== null;
  const isHolder = !entry || canEnterRoom(entry, held);
  // A stock whose room isn't added on chain yet: listed, but nothing to read or post.
  const notOpen = gated && !room;
  // Connected wallets enable chat first in every room (same unlock screen); signed-out visitors can still read the lounge.
  const canRead = gated ? isHolder && !notOpen && chat.ready : chat.ready || !chat.address;
  const { messages, loading, send, dismiss, hiddenCount, showMuted, setShowMuted } = useRoomMessages(room, chat.keys);
  const draft = drafts[roomKey] ?? "";
  const q = search.toLowerCase().trim();
  const shown = messages.filter((m) => !q || `${m.author} ${m.text ?? ""}`.toLowerCase().includes(q));
  const count = messages.length;
  // Usernames (CollectNames) and card avatars (CollectProfiles) for everyone on screen.
  const people = [...messages.map((m) => m.author), ...roomMembers, ...(profile ? [profile] : []), ...(chat.address ? [chat.address] : [])];
  const { names, refetch: refetchNames } = useNames(people);
  const { avatars, refetch: refetchAvatars } = useAvatars(people);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [roomKey, count, mobileChat, canRead]);

  function pickRoom(key: string) {
    setRoomKey(key);
    setSearch("");
    setSearchOpen(false);
    setReply(null);
    setMobileChat(true);
  }
  function sendMessage() {
    if (!chat.ready || !isHolder || !draft.trim() || !room) return;
    const text = draft.trim();
    const replyTo = reply && reply.text !== null ? { id: reply.id, author: reply.author, text: reply.text } : undefined;
    setDrafts((prev) => ({ ...prev, [roomKey]: "" }));
    setReply(null);
    setSearch("");
    composerInput.current?.focus();
    // Readers are resolved at send time, so the message is sealed to today's holders.
    chat.readersOf(room).then((readers) => send(text, readers, replyTo));
  }
  async function openMembers() {
    membersDialog.current?.showModal();
    if (!room) return;
    setMembersLoading(true);
    try {
      setRoomMembers((await chat.readersOf(room)).map((m) => m.account));
    } finally {
      setMembersLoading(false);
    }
  }
  /** Scrolls to a quoted message and flashes it. */
  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove(FLASH);
    void el.offsetWidth; // restart the animation
    el.classList.add(FLASH);
  }
  function openProfile(account: string) {
    // Your own picture or name opens your profile editor rather than the read-only view.
    if (chat.address && account.toLowerCase() === chat.address.toLowerCase()) {
      membersDialog.current?.close();
      setEditing(true);
      return;
    }
    setProfile(account);
    // The profile slides in from the side, so the members list (if open) steps aside.
    membersDialog.current?.close();
    profileDialog.current?.showModal();
  }

  const title = entry?.title ?? "…";
  const isMe = (a: string) => Boolean(chat.address) && a.toLowerCase() === chat.address!.toLowerCase();
  const nameOf = (a: string) => names.get(a.toLowerCase());
  const who = (a: string) => nameOf(a) ?? (isMe(a) ? "you" : short(a));
  /** The card avatar if set, else the address initials, inside one of the avatar squares. */
  const face = (a: string) => <CardAvatar crop={avatars.get(a.toLowerCase())} className="rounded-full" fallback={a.slice(2, 4)} />;

  const unlockPanel = (
    <div className={ui.empty}>
      <p className={ui.label}>[ {gated ? "holders only" : "public"} ]</p>
      <h3 className={ui.emptyTitle}>{gated ? `Unlock ${ticker} holder chat.` : "Unlock public chat."}<br /><span>One signature. No gas.</span></h3>
      <button type="button" className={cleanButton.solid} disabled={chat.enabling} onClick={chat.enable}>
        {chat.enabling ? "Check your wallet…" : "Enable chat"} <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" />
      </button>
      {chat.enableError && <p className="text-sm text-down" role="alert">{chat.enableError}</p>}
    </div>
  );

  return (
    <div className="grid h-full min-h-0 overflow-hidden text-black max-desk:flex desk:grid-cols-[300px_minmax(0,1fr)] wide:grid-cols-[340px_minmax(0,1fr)]">
      <aside className={cn("flex min-h-0 flex-col max-desk:w-full desk:border-r desk:border-border desk:pr-6", mobileChat ? "max-desk:hidden" : "")} aria-label="Community rooms">
        <header className="flex items-baseline justify-between gap-3 pt-6 desk:pt-10">
          <h1 className="text-[22px] leading-[1.3] font-normal tracking-tight">Rooms</h1>
          <span className={ui.label}>[{pad(entries.length)} rooms]</span>
        </header>
        <nav className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-1.5 overflow-y-auto desk:mt-6" aria-label="Rooms">
          {entries.map((e) => {
            const locked = !canEnterRoom(e, held);
            const q = e.ticker ? prices[e.ticker] : undefined;
            return (
              // Same as demo: locked rooms look locked (dashed, grey, faded logo); rooms you're in look normal.
              <button key={e.key} type="button" className={cn(ui.roomRow, locked && "border-dashed bg-surface-muted")} aria-current={entry?.key === e.key ? "true" : undefined} aria-label={locked ? `${e.title}, locked: hold a ${e.ticker} card to join` : undefined} onClick={() => pickRoom(e.key)}>
                {e.ticker ? <TokenIcon symbol={e.ticker} className={cn("size-8", locked && "opacity-40 grayscale")} /> : <span className={cn(ui.symbol, "size-8 text-base")}>#</span>}
                <span className="flex min-w-0 flex-col">
                  <strong className={cn("text-base leading-snug font-normal", locked && "text-muted")}>{e.title}</strong>
                  <span className="flex min-w-0 items-center gap-1 text-sm leading-snug text-muted">{e.ticker ? <>{locked && <span className="shrink-0"><Icon name="lock" size={12} /></span>}<span className="truncate">{e.subtitle ?? "Holders"}</span></> : e.room?.encrypted ? "Holders" : "Public"}</span>
                </span>
                {q?.price != null && (
                  <span className="ml-auto flex flex-col items-end pl-2">
                    <span className="text-base leading-snug tabular-nums">{usd(q.price)}</span>
                    {q.changePct != null && <span className={cn("text-xs leading-snug tabular-nums", q.changePct >= 0 ? "text-up" : "text-down")}>{q.changePct >= 0 ? "+" : ""}{q.changePct.toFixed(2)}%</span>}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        {/* Mirrors the composer's height so both rules line up. */}
        <footer className={cn(ui.composerArea, "mt-4")}>
          {chat.address && (namesLive || avatarsLive) ? (
            <button type="button" className={cn(ui.roomRow, "h-12 py-0")} onClick={() => setEditing(true)}>
              <span className={cn(ui.avatar, "relative size-8 overflow-hidden bg-black text-white")}>{face(chat.address)}</span>
              <strong className="min-w-0 truncate text-base font-normal">{nameOf(chat.address) ?? "Set a username"}</strong>
              <span className="ml-auto text-muted"><ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></span>
            </button>
          ) : (
            <div className="h-12" aria-hidden="true" />
          )}
          <a className={cn(ui.note, "flex items-center justify-between transition-colors hover:text-black")} href={`${SNOWTRACE}/address/${chatAddress}`} target="_blank" rel="noreferrer">[ stored on bnb chain ] <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></a>
        </footer>
        {editing && chat.address && <MyProfileEditor account={chat.address as Address} onClose={() => setEditing(false)} />}
      </aside>

      <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col desk:pl-8", mobileChat ? "" : "max-desk:hidden")} aria-label={entry ? title : "Room"}>
        <header className="flex shrink-0 items-center gap-3 border-b border-border pt-6 pb-4 desk:pt-10 desk:pb-5">
          <button type="button" className={cn(ui.iconButton, "desk:hidden")} aria-label="Back to rooms" onClick={() => setMobileChat(false)}><Icon name="back" /></button>
          <h2 className="min-w-0 truncate py-0.5 text-[28px] leading-[1.2] font-light tracking-tight">{title}</h2>
          <span className={cn(ui.label, "shrink-0 whitespace-nowrap max-phone:hidden")}>[ {gated || room?.encrypted ? "encrypted" : "public"} ]</span>
          <div className="ml-auto flex gap-2">
            <button className={ui.iconButton} type="button" aria-label="Search messages" aria-expanded={searchOpen} disabled={!canRead} onClick={() => { setSearchOpen(!searchOpen); setSearch(""); }}><Icon name="search" size={18} /></button>
            <button className={ui.iconButton} type="button" aria-label="View members" disabled={!room} onClick={openMembers}><Icon name="members" size={18} /></button>
          </div>
        </header>
        {searchOpen && <div className="flex shrink-0 items-center gap-2 border-b border-border py-3"><input autoFocus type="search" className={cleanField} aria-label="Search messages" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} /><button type="button" className={ui.iconButton} aria-label="Close search" onClick={() => { setSearchOpen(false); setSearch(""); }}><Icon name="close" size={18} /></button></div>}

        {gated && !isHolder ? (
          <div className={ui.empty}>
            <p className={ui.label}>[ holders only ]</p>
            <h3 className={ui.emptyTitle}>A room for {ticker} card holders.<br /><span>Hold a {ticker} card to read and post.</span></h3>
            <div className="flex flex-wrap justify-center gap-3">
              {!connected && <WalletEntry className={cleanButton.solid} />}
              <Link href="/packs" className={connected ? cleanButton.solid : cleanButton.outline}>Open a pack <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></Link>
            </div>
          </div>
        ) : notOpen ? (
          <div className={ui.empty}><p className={ui.label}>[ holders only ]</p><h3 className={ui.emptyTitle}>{ticker} room opens soon.</h3></div>
        ) : !canRead ? (
          chat.address ? unlockPanel : <div className={ui.empty}><p className={ui.label}>[ wallet ]</p><h3 className={ui.emptyTitle}>Connect to unlock.</h3><WalletEntry className={cleanButton.solid} /></div>
        ) : (
          <>
            <div ref={feed} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-6 desk:py-8">
              <p className="mb-6 text-sm text-muted">[ {room?.encrypted ? "end-to-end encrypted" : "public"} · on bnb chain ]</p>
              {(hiddenCount > 0 || showMuted) && (
                <p className="mb-6 text-sm text-muted" role="status">
                  {showMuted ? "Showing messages from muted accounts." : `${hiddenCount} ${hiddenCount === 1 ? "message" : "messages"} from muted accounts hidden.`}{" "}
                  <button type="button" className="text-black underline underline-offset-4" onClick={() => setShowMuted(!showMuted)}>{showMuted ? "Hide" : "Show"}</button>
                </p>
              )}
              {!loading && shown.length === 0 && <div className={ui.empty}><h3 className={ui.emptyTitle}>{search ? "No matches." : <>Quiet in here.<br /><span>Say hey.</span></>}</h3>{search && <button type="button" className={cleanButton.outline} onClick={() => setSearch("")}>Clear search</button>}</div>}
              {loading && <p className="mb-6 text-sm text-muted">Reading messages…</p>}
              <ul className="m-0 flex list-none flex-col gap-5 p-0 desk:gap-6">
                {shown.map((m) => {
                  const mine = isMe(m.author);
                  return (
                    <li key={m.id} id={`msg-${m.id}`} className="group/message flex items-start gap-3 rounded-md">
                      <button type="button" className={cn(ui.avatar, "relative overflow-hidden", mine ? "bg-black text-white" : "")} aria-label={mine ? "Edit your profile" : `View ${who(m.author)}'s profile`} onClick={() => openProfile(m.author)}>{face(m.author)}</button>
                      <div className="min-w-0 flex-1 desk:max-w-[680px]">
                        <div className="mb-1 flex items-baseline gap-2.5">
                          <button type="button" className="text-sm hover:underline" onClick={() => openProfile(m.author)}>{who(m.author)}</button>
                          <span className={cn("text-xs tabular-nums", m.status === "failed" ? "text-down" : "text-muted-soft")}>{m.status === "sending" ? "sending…" : m.status === "failed" ? "not sent" : ago(m.time, now)}</span>
                        </div>
                        {m.reply && (
                          <button type="button" className="mb-1.5 flex max-w-full flex-col gap-0.5 rounded-r-md border-l-2 border-black bg-surface-muted px-3 py-2 text-left transition-colors hover:bg-[#ececec]" onClick={() => jumpTo(m.reply!.id)} aria-label={`Replying to ${who(m.reply.author)}: ${m.reply.text}. Show original.`}>
                            <span className="inline-flex items-center gap-1.5 text-xs"><Icon name="reply" size={12} /> {who(m.reply.author)}</span>
                            <span className="truncate text-xs text-muted">{m.reply.text}</span>
                          </button>
                        )}
                        <p className={cn("m-0 text-[15px] leading-[1.65] break-words whitespace-pre-wrap", m.text === null ? "inline-flex items-center gap-1.5 text-muted" : "", m.status !== "sent" ? "opacity-60" : "")}>{m.text ?? <><Icon name="lock" size={14} /> Sent before you joined</>}</p>
                        <div className="mt-0.5 -mb-2 flex h-10 gap-0.5 desk:h-[30px]">
                          {m.status === "failed" ? (
                            <button type="button" className={messageAction} onClick={() => dismiss(m.id)} aria-label="Dismiss failed message"><Icon name="close" size={16} /></button>
                          ) : m.text !== null && m.status === "sent" && (
                            <button type="button" className={messageAction} aria-label={`Reply to ${who(m.author)}`} onClick={() => { setReply(m); composerInput.current?.focus(); }}><Icon name="reply" size={16} /></button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            {!chat.address ? (
              <div className={ui.composerArea}><WalletEntry className={cn(cleanButton.solid, "w-full justify-between")} /><p className={ui.note}>Connect a wallet to post.</p></div>
            ) : !chat.ready ? (
              <div className={ui.composerArea}>
                <button type="button" className={cn(cleanButton.solid, "w-full justify-between")} disabled={chat.enabling} onClick={chat.enable}>{chat.enabling ? "Check your wallet…" : "Enable chat"} <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></button>
                {chat.enableError ? <p className={cn(ui.note, "text-down")} role="alert">{chat.enableError}</p> : <p className={ui.note}>One signature · no gas</p>}
              </div>
            ) : (
              <div className={ui.composerArea}>
                {reply && <div className="mb-3 flex items-center gap-3 border-l-2 border-black pl-3"><div className="min-w-0 flex-1"><span className="text-xs">Replying to {who(reply.author)}</span><p className="truncate text-xs text-muted">{reply.text}</p></div><button type="button" className={ui.iconButton} aria-label="Cancel reply" onClick={() => setReply(null)}><Icon name="close" size={18} /></button></div>}
                <form className="flex items-end gap-2 rounded-md border border-border-strong bg-white p-[3px] transition-colors focus-within:border-black" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
                  <textarea rows={1} ref={composerInput} className="max-h-[120px] min-h-10 min-w-0 flex-1 resize-none bg-transparent py-[9px] pr-2 pl-3 text-base leading-[22px] outline-none [field-sizing:content]" value={draft} onChange={(event) => setDrafts((prev) => ({ ...prev, [roomKey]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(min-width: 801px)").matches) { event.preventDefault(); sendMessage(); } }} maxLength={500} placeholder={`Message ${title}`} aria-label="Message" aria-describedby="chat-note" />
                  <button type="submit" className="grid size-10 shrink-0 place-items-center rounded-md border-[1.5px] border-black bg-black text-white disabled:cursor-not-allowed disabled:opacity-35" disabled={!draft.trim()} aria-label="Send message"><Icon name="send" size={18} /></button>
                </form>
                <p id="chat-note" className={ui.note}>Gas covered</p>
              </div>
            )}
          </>
        )}
      </section>

      <dialog ref={membersDialog} className={ui.drawerRight} aria-labelledby="members-title" onClick={(event) => { if (event.target === event.currentTarget) membersDialog.current?.close(); }}>
        <header className="sticky top-0 z-10 bg-white flex items-center justify-between border-b border-border px-6 py-3"><span className={ui.label}>[ {room?.encrypted ? "holders" : "members"} ]</span><button type="button" className={cn(dialogClose, "hover:bg-black/5")} aria-label="Close members" onClick={() => membersDialog.current?.close()}><Icon name="close" size={18} /></button></header>
        <div className="px-6 pt-4 pb-10">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="members-title" className="min-w-0 truncate text-[28px] leading-[1.1] font-light tracking-tight">{entry?.title ?? "Members"}</h2>
            {!membersLoading && <span className={ui.label}>[{pad(roomMembers.length)}]</span>}
          </div>
          {membersLoading && roomMembers.length === 0 ? (
            <p className="mt-6 text-sm text-muted" role="status">Loading members…</p>
          ) : roomMembers.length === 0 ? (
            <p className="mt-6 text-sm text-muted">No members yet.</p>
          ) : (
            <ul className="mt-6 grid list-none gap-1.5 p-0">
              {roomMembers.map((account) => (
                <li key={account}>
                  <button type="button" className="flex w-full items-center gap-3 rounded-md border border-border bg-white/60 px-3 py-2.5 text-left transition-colors hover:border-black" onClick={() => openProfile(account)}>
                    <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-muted text-xs text-muted uppercase">{face(account)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base">{who(account)}{isMe(account) && nameOf(account) && <span className="ml-2 text-sm text-muted">you</span>}</span>
                      <span className="block truncate text-sm text-muted tabular-nums">{short(account)}</span>
                    </span>
                    <ArrowUpRightIcon weight="bold" className="shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
      <dialog ref={profileDialog} className={ui.drawer} aria-labelledby="profile-title" onClick={(event) => { if (event.target === event.currentTarget) profileDialog.current?.close(); }}>
        {profile && (
          <Profile
            key={profile}
            account={profile}
            name={nameOf(profile)}
            crop={avatars.get(profile.toLowerCase())}
            label={isMe(profile) && !nameOf(profile) ? short(profile) : who(profile)}
            isMe={isMe(profile)}
            onNameChanged={() => { void refetchNames(); }}
            onAvatarChanged={() => { void refetchAvatars(); }}
            onClose={() => profileDialog.current?.close()}
          />
        )}
      </dialog>
    </div>
  );
}

/** Cards shown in a member's profile (best first); the rest are counted. */
const PROFILE_CARDS = 12;

/** A member's on-chain holdings, read live; your own also edits username, picture and bio. */
function Profile({ account, name, crop, label, isMe, onNameChanged, onAvatarChanged, onClose }: {
  account: string; name?: string; crop?: CardAvatarCrop; label: string; isMe: boolean;
  onNameChanged: () => void; onAvatarChanged: () => void; onClose: () => void;
}) {
  const { cards, ready } = useCollectCardsOf(account as `0x${string}`);
  const rarest = cards.reduce((top, c) => Math.max(top, c.rarity), -1);
  // Highest rarity first, so the best pulls lead the grid.
  const shown = [...cards].sort((x, y) => y.rarity - x.rarity).slice(0, PROFILE_CARDS);

  return (
    <>
      <header className="sticky top-0 z-10 bg-white flex items-center justify-between border-b border-border px-6 py-3"><span className={ui.label}>[ profile ]</span><button type="button" className={cn(dialogClose, "hover:bg-black/5")} aria-label="Close profile" onClick={onClose}><Icon name="close" size={18} /></button></header>
      <div className="px-6 pt-6 pb-10">
        {/* Who: picture, name and address, centred; the bio sits under them. */}
        <div className="flex flex-col items-center text-center">
          <span className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-muted text-2xl text-muted uppercase">
            <CardAvatar crop={crop} className="rounded-full" sizes="192px" fallback={(name ?? account.slice(2)).slice(0, 2)} />
          </span>
          <h2 id="profile-title" className="mt-4 max-w-full truncate text-[28px] leading-[1.1] font-light tracking-tight">{label}</h2>
          <a className="mt-1.5 inline-flex items-center gap-1 text-sm text-muted tabular-nums transition-colors hover:text-black" href={`${SNOWTRACE}/address/${account}`} target="_blank" rel="noreferrer" title={account}>{short(account)} <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" /></a>
          {avatarsLive && <div className="max-w-full break-words"><Bio account={account as `0x${string}`} isMe={isMe} /></div>}
        </div>

        {/* At a glance: how many cards, and the best one. */}
        <dl className="mt-8 grid grid-cols-2 divide-x divide-border border-y border-border text-center">
          <div className="py-4"><dt className="text-sm text-muted">Cards</dt><dd className="mt-1 text-2xl tabular-nums">{ready ? cards.length : "…"}</dd></div>
          <div className="py-4"><dt className="text-sm text-muted">Rarest</dt><dd className="mt-1 text-2xl">{!ready ? "…" : rarest >= 0 ? RARITY_NAMES[rarest] : "—"}</dd></div>
        </dl>

        <section className="mt-6" aria-labelledby="profile-cards">
          <h3 id="profile-cards" className="sr-only">Cards</h3>
          {!ready ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : shown.length ? (
            <ul className="grid list-none grid-cols-4 gap-2 p-0">
              {shown.map((c) => {
                const art = cardArt(c.ticker, c.rarity, c.tier);
                return (
                  <li key={String(c.id)} aria-label={`${art.name}, ${RARITY_NAMES[c.rarity]}`}>
                    <StockCardFront art={art} rarity={c.rarity} decorative sizes="96px" className="w-full" />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted">No cards yet</p>
          )}
          {ready && cards.length > shown.length && <p className="mt-3 text-center text-sm text-muted">+{cards.length - shown.length} more</p>}
        </section>

        {isMe && (namesLive || (avatarsLive && ready)) && (
          <section className="mt-8 border-t border-border pt-6 [&_form>label:first-child]:mt-0" aria-labelledby="profile-edit">
            <h3 id="profile-edit" className="text-sm text-muted">Edit profile</h3>
            {namesLive && <div className="mt-4"><UsernameForm current={name} onSaved={onNameChanged} /></div>}
            {avatarsLive && ready && <AvatarEditor cards={cards} current={crop} onSaved={onAvatarChanged} />}
          </section>
        )}
      </div>
    </>
  );
}

/** The profile page's edit modal, opened from the community footer. */
function MyProfileEditor({ account, onClose }: { account: Address; onClose: () => void }) {
  const profile = useProfile(account);
  return <LiveProfileEditor account={account} profile={profile} onClose={onClose} />;
}
