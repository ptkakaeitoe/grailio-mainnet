"use client";

import { ArrowUpIcon, ArrowUpRightIcon, CaretLeftIcon, LockIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CardAvatar, clampCrop } from "@/components/card-avatar";
import { cleanButton, cn } from "@/components/clean-ui";
import { ago, pad, ui } from "@/components/community-workspace";
import { useDemo } from "@/components/demo-provider";
import { TokenIcon } from "@/components/token-icon";
import { DEMO_STOCK_CARDS, STOCK_CARDS, type StockCard } from "@/lib/cards";
import { useDemoProfile } from "@/lib/demo-profile";
import { usd, useStockPrices } from "@/lib/use-stock-prices";

/**
 * Community in demo mode: the lounge plus a room per stock, open to holders of
 * a demo card of that stock. Simulated collectors post; your messages stay in
 * this demo session. CommunityPreview is the same layout before chat launches.
 */

type Room = { id: string; label: string; ticker: string | null };
type Message = { id: string; author: string; text: string; time: number; mine?: boolean };

const ROOMS = (cards: StockCard[]): Room[] => [
  { id: "lounge", label: "The lounge", ticker: null },
  ...cards.map((c) => ({ id: c.ticker, label: `$${c.ticker}`, ticker: c.ticker })),
];

const PEOPLE = ["relicfox", "bluechip_ben", "tsla_maxi", "seedvault", "nightdesk"];
const SEED: Record<string, string[]> = {
  lounge: ["gm collectors", "just pulled a legendary from a Mythos pack 👀", "anyone else stacking Saga packs this week?", "the Volt Crown art is unreal", "welcome to the new folks 👋"],
  AAPL: ["Silver Seed holders, checking in", "holding mine until earnings", "the card is up a few cents today"],
  MSFT: ["Prism Gate gang", "rare pull last night, keeping it"],
  NVDA: ["Neural Eye is my favorite card", "NVDA cards are popular on the market today"],
  TSLA: ["Volt Crown epic just landed", "who's listing in BNB vs USDC?"],
  AMZN: ["Wayfinder Key collectors 🔑", "anyone redeem theirs yet?"],
};
const REPLIES = ["nice 🙌", "same here", "good luck with your pulls", "welcome!", "agreed", "that's a great card"];

/** A card's art framed as a square picture (same framing as profile pictures). */
const cardCrop = (ticker: string) => ({ ticker, ...clampCrop(5000, 3000, 200) });
/** Each simulated collector always has the same card as their picture. */
const personTicker = (name: string) => DEMO_STOCK_CARDS[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % DEMO_STOCK_CARDS.length].ticker;

const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
let nextId = 0;
function newMessage(author: string, text: string, mine = false): Message {
  // Time-based so ids stay unique next to messages saved before a reload.
  return { id: `m-${Date.now()}-${++nextId}`, author, text, time: Math.floor(Date.now() / 1000), mine };
}

// Saved in this browser with the rest of demo mode; "Reset demo" clears it (lib/demo-store).
const CHAT_KEY = "collect-demo-chat-v1";
function loadChat(): Record<string, Message[]> {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (raw) return JSON.parse(raw) as Record<string, Message[]>;
  } catch {
    // Blocked storage or bad data: start from the seeded rooms.
  }
  return seedStore();
}
function saveChat(messages: Record<string, Message[]>) {
  try {
    // Keep the last 200 messages per room.
    localStorage.setItem(CHAT_KEY, JSON.stringify(Object.fromEntries(Object.entries(messages).map(([room, list]) => [room, list.slice(-200)]))));
  } catch {
    // Storage blocked or full: chat still works for this visit.
  }
}
function seedStore(): Record<string, Message[]> {
  const now = Math.floor(Date.now() / 1000);
  const out: Record<string, Message[]> = {};
  for (const [room, lines] of Object.entries(SEED)) {
    out[room] = lines.map((text, i) => ({ id: `${room}-${i}`, author: PEOPLE[(i + room.length) % PEOPLE.length], text, time: now - (lines.length - i) * 7 * 60 }));
  }
  return out;
}

/** A room you can't enter yet: dashed and grey, so it reads as locked at a glance. */
const lockedRow = "border-dashed bg-surface-muted";

/** Room list beside the chat; the same in demo and before launch. */
function RoomList({ rooms, current, locked, onPick, prices, footer }: {
  rooms: Room[];
  current: string;
  locked: (r: Room) => boolean;
  onPick: (id: string) => void;
  prices: Record<string, { price: number | null; changePct: number | null } | undefined>;
  footer: ReactNode;
}) {
  return (
    <>
      <header className="flex items-baseline justify-between gap-3 pt-6 desk:pt-10">
        <h1 className="text-[22px] leading-[1.3] font-normal tracking-tight">Rooms</h1>
        <span className={ui.label}>[{pad(rooms.length)} rooms]</span>
      </header>
      <nav className="mt-4 grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto desk:mt-6" aria-label="Rooms">
        {[...rooms]
          .map((r) => ({ r, rank: r.ticker === null ? 0 : locked(r) ? 2 : 1 }))
          .sort((a, b) => a.rank - b.rank)
          .map(({ r }) => {
          const q = r.ticker ? prices[r.ticker] : undefined;
          const closed = locked(r);
          return (
            // Locked rooms look locked (dashed, grey, faded logo); rooms you're in look normal.
            <button key={r.id} type="button" className={cn(ui.roomRow, closed && lockedRow)} aria-current={current === r.id ? "true" : undefined} aria-label={closed ? `${r.label}, locked: hold a ${r.ticker} card to join` : undefined} onClick={() => onPick(r.id)}>
              {r.ticker ? <TokenIcon symbol={r.ticker} className={cn("size-8", closed && "opacity-40 grayscale")} /> : <span className={cn(ui.symbol, "size-8 text-base")}>#</span>}
              <span className="flex min-w-0 flex-col">
                <strong className={cn("text-base leading-snug font-normal", closed && "text-muted")}>{r.label}</strong>
                <span className="inline-flex items-center gap-1 truncate text-sm leading-snug text-muted">
                  {r.ticker ? <>{closed && <LockIcon size={12} />}Holders</> : "Public"}
                </span>
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
      <footer className={cn(ui.composerArea, "mt-4")}>{footer}</footer>
    </>
  );
}

/** Two columns from 801px; phones show the room list or the chat. */
function ChatFrame({ list, chat, showChat }: { list: ReactNode; chat: ReactNode; showChat: boolean }) {
  return (
    <div className="grid h-full min-h-0 overflow-hidden text-black max-desk:flex desk:grid-cols-[300px_minmax(0,1fr)] wide:grid-cols-[340px_minmax(0,1fr)]">
      <aside className={cn("flex min-h-0 flex-col max-desk:w-full desk:border-r desk:border-border desk:pr-6", showChat ? "max-desk:hidden" : "")} aria-label="Community rooms">{list}</aside>
      <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col desk:pl-8", showChat ? "" : "max-desk:hidden")}>{chat}</section>
    </div>
  );
}

function ChatHeader({ title, label, onBack }: { title: string; label: string; onBack: () => void }) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border pt-6 pb-4 desk:pt-10 desk:pb-5">
      <button type="button" className={cn(ui.iconButton, "desk:hidden")} aria-label="Back to rooms" onClick={onBack}><CaretLeftIcon size={20} /></button>
      <h2 className="min-w-0 truncate py-0.5 text-[28px] leading-[1.2] font-normal tracking-tight">{title}</h2>
      <span className={cn(ui.label, "shrink-0 whitespace-nowrap max-phone:hidden")}>[ {label} ]</span>
    </header>
  );
}

export function DemoCommunity() {
  const demo = useDemo();
  const { profile } = useDemoProfile();
  const { byTicker } = useStockPrices();
  const rooms = ROOMS(DEMO_STOCK_CARDS);
  const [roomId, setRoomId] = useState("lounge");
  const [showChat, setShowChat] = useState(true);
  const [messages, setMessages] = useState<Record<string, Message[]>>(loadChat);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const feed = useRef<HTMLDivElement>(null);
  const room = rooms.find((r) => r.id === roomId)!;
  const held = new Set(demo.cards.map((c) => c.ticker));
  const locked = (r: Room) => r.ticker !== null && !held.has(r.ticker);
  const list = messages[roomId] ?? [];
  const me = profile.name || "you";

  useEffect(() => { saveChat(messages); }, [messages]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (feed.current) feed.current.scrollTop = feed.current.scrollHeight; }, [roomId, list.length, showChat]);

  function post(room: string, message: Message) {
    setMessages((m) => ({ ...m, [room]: [...(m[room] ?? []), message] }));
  }
  function send() {
    const text = draft.trim();
    if (!text || locked(room)) return;
    post(roomId, newMessage(me, text, true));
    setDraft("");
    // Someone answers, so the room feels alive.
    const where = roomId;
    setTimeout(() => post(where, newMessage(pick(PEOPLE), pick(REPLIES))), 2500);
  }

  // Everyone has a card-art picture: yours (or a card you own), and one per simulated collector.
  const myCrop = profile.avatar ?? (demo.cards[0] ? cardCrop(demo.cards[0].ticker) : cardCrop(DEMO_STOCK_CARDS[2].ticker));
  const face = (m: Message) => (
    <CardAvatar crop={m.mine ? myCrop : cardCrop(personTicker(m.author))} className="rounded-full" fallback={m.author.replace("@", "").slice(0, 2)} />
  );

  return (
    <ChatFrame
      showChat={showChat}
      list={
        <RoomList
          rooms={rooms}
          current={roomId}
          locked={locked}
          onPick={(id) => { setRoomId(id); setShowChat(true); }}
          prices={byTicker}
          footer={<><Link href="/profile" className={cn(ui.roomRow, "h-12 py-0")}><span className={cn(ui.avatar, "relative size-8 overflow-hidden bg-black text-white")}><CardAvatar crop={myCrop} className="rounded-full" fallback="me" /></span><strong className="min-w-0 truncate text-base font-normal">{profile.name ? profile.name : "Set a username"}</strong><span className="ml-auto text-muted"><ArrowUpRightIcon weight="bold" /></span></Link></>}
        />
      }
      chat={
        <>
          <ChatHeader title={room.label} label={room.ticker ? "holders" : "public"} onBack={() => setShowChat(false)} />
          {locked(room) ? (
            <div className={ui.empty}>
              <p className={ui.label}>[ holders only ]</p>
              <h3 className={ui.emptyTitle}>A room for {room.label} card holders.<br /><span>Hold a {room.ticker} card to read and post.</span></h3>
              <Link href="/packs" className={cleanButton.solid}>Open a pack <ArrowUpRightIcon weight="bold" /></Link>
            </div>
          ) : (
            <>
              <div ref={feed} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-6 desk:py-8">
                <p className="mb-6 text-sm text-muted">[ {room.ticker ? `${room.label} holders` : "public"} · demo ]</p>
                <ul className="m-0 flex list-none flex-col gap-5 p-0 desk:gap-6">
                  {list.map((m) => (
                    <li key={m.id} className="flex items-start gap-3">
                      <span className={cn(ui.avatar, "relative overflow-hidden", m.mine ? "bg-black text-white" : "")} aria-hidden="true">{face(m)}</span>
                      <div className="min-w-0 flex-1 desk:max-w-[680px]">
                        <div className="mb-1 flex items-baseline gap-2.5">
                          <span className="text-sm">{m.mine ? me : m.author}</span>
                          <span className="text-xs text-muted-soft tabular-nums">{ago(m.time, now)}</span>
                        </div>
                        <p className="m-0 text-[15px] leading-[1.65] break-words whitespace-pre-wrap">{m.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={ui.composerArea}>
                <form className="flex items-end gap-2 rounded-md border border-border-strong bg-white p-[3px] transition-colors focus-within:border-black" onSubmit={(e) => { e.preventDefault(); send(); }}>
                  <textarea rows={1} className="max-h-[120px] min-h-10 min-w-0 flex-1 resize-none bg-transparent py-[9px] pr-2 pl-3 text-base leading-[22px] outline-none [field-sizing:content]" value={draft} maxLength={500} placeholder={`Message ${room.label}`} aria-label="Message" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
                  <button type="submit" className="grid size-10 shrink-0 place-items-center rounded-md border-[1.5px] border-black bg-black text-white transition-colors hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-35" disabled={!draft.trim()} aria-label="Send message"><ArrowUpIcon weight="bold" size={18} /></button>
                </form>
              </div>
            </>
          )}
        </>
      }
    />
  );
}

/** Before CollectChat launches: the real rooms, and a way to try chat in demo. */
export function CommunityPreview() {
  const demo = useDemo();
  const { byTicker } = useStockPrices(60_000, "tokens");
  const rooms = ROOMS(STOCK_CARDS);
  const [roomId, setRoomId] = useState("lounge");
  const [showChat, setShowChat] = useState(false);
  const room = rooms.find((r) => r.id === roomId)!;
  return (
    <ChatFrame
      showChat={showChat}
      list={<RoomList rooms={rooms} current={roomId} locked={(r) => r.ticker !== null} onPick={(id) => { setRoomId(id); setShowChat(true); }} prices={byTicker} footer={<><div className="h-12" aria-hidden="true" /><p className={ui.note}>[ opening at launch ]</p></>} />}
      chat={
        <>
          <ChatHeader title={room.label} label={room.ticker ? "holders" : "public"} onBack={() => setShowChat(false)} />
          <div className={ui.empty}>
            <p className={ui.label}>[ opening at launch ]</p>
            <h3 className={ui.emptyTitle}>Chat with fellow collectors.<br /><span>On BNB Chain, no gas.</span></h3>
            <p className="max-w-[440px] text-sm text-muted">The lounge is open to everyone; each token’s room is for its card holders. Try it now with demo cards.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" className={cleanButton.solid} onClick={demo.start}>Try the demo <ArrowUpRightIcon weight="bold" /></button>
              <Link href="/packs" className={cleanButton.outline}>Open a pack <ArrowUpRightIcon weight="bold" /></Link>
            </div>
          </div>
        </>
      }
    />
  );
}
