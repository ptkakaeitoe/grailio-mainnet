"use client";

import { artOf } from "@/lib/cards";
import { ArrowUpRightIcon, CheckIcon, CopyIcon, DownloadSimpleIcon, ShareNetworkIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import QRCode from "qrcode";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { zeroAddress, type Address } from "viem";
import { useReadContract } from "wagmi";

import { cn } from "@/components/clean-ui";
import { CARD_ASPECT, clampCrop, NFT_ASPECT } from "@/components/card-avatar";
import { GRAILIO_MARK } from "@/components/collect-mark";
import { useDemo } from "@/components/demo-provider";
import { pointsAbi, pointsAddress } from "@/lib/collect-dao";
import { RARITY_NAMES } from "@/lib/contracts";
import { useAvatars, type CardAvatarCrop } from "@/lib/use-avatars";
import { useDemoProfile } from "@/lib/demo-profile";
import { useNames } from "@/lib/use-names";
import { useStockCards } from "@/lib/use-stock-cards";

const W = 640;
const H = 400;
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'Geist Mono', ui-monospace, Menlo, monospace";
/** Right column: the picture on top and the QR below, joined in one outlined block. */
const COL = { x: 460, y: 80, w: 140 };
const AVATAR = { x: COL.x, y: COL.y, d: COL.w };
const QR = { x: COL.x + 16, y: COL.y + COL.w + 16, size: COL.w - 32 };
/** Corner radius in SVG units: a small, printed-card corner. */
const R = 16;
const INK = "#111111";
/** The mark as a CSS mask, for the hover reflection over the watermark. */
const MARK_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="${GRAILIO_MARK}"/></svg>`)}")`;

const subscribeNoop = () => () => {};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The QR as one SVG path, drawn straight from the code matrix (no async, sharp at any size). */
function qrPath(text: string) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return { d, n };
}

/** Fetches an image and inlines it as a data URL so the PNG export can draw it. */
async function inline(href: string): Promise<string | null> {
  try {
    const res = await fetch(href, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * A shareable profile card: picture, name, cards, points, rarest pull and a QR
 * that opens the public profile. Rendered as one SVG, so it downloads as a PNG.
 */
export function IdentityCard({ account }: { account: Address }) {
  const { names } = useNames([account]);
  const { avatars } = useAvatars([account]);
  const { cards, ready } = useStockCards(account);
  const { data: points } = useReadContract({
    address: pointsAddress,
    abi: pointsAbi,
    functionName: "pointsOf",
    args: [account],
    query: { enabled: pointsAddress !== zeroAddress, refetchInterval: 30_000 },
  });
  const name = names.get(account.toLowerCase());
  // Rarest pull: highest rarity, then the most valuable at opening.
  const rarest = cards.reduce<(typeof cards)[number] | null>((best, c) => (!best || c.rarity > best.rarity || (c.rarity === best.rarity && c.usd > best.usd) ? c : best), null);
  return (
    <IdCard
      name={name}
      address={account}
      path={`/@${name ?? account}`}
      cards={ready ? cards.length : null}
      points={points !== undefined ? points.toString() : null}
      rarest={rarest ? { rarity: rarest.rarity, ticker: rarest.ticker } : null}
      crop={avatars.get(account.toLowerCase())}
    />
  );
}

/** Demo: the same card from your demo profile, wallet and points; the QR opens /@yourname. */
export function DemoIdCard() {
  const demo = useDemo();
  const { profile } = useDemoProfile();
  const rarest = demo.cards.reduce<(typeof demo.cards)[number] | null>((best, c) => (!best || c.rarity > best.rarity ? c : best), null);
  return (
    <IdCard
      name={profile.name || undefined}
      address={null}
      path={profile.name ? `/@${profile.name}` : "/"}
      cards={demo.cards.length}
      points={String(demo.points)}
      rarest={rarest ? { rarity: rarest.rarity, ticker: rarest.ticker } : null}
      crop={profile.avatar ? { ...profile.avatar, tokenId: 0n } : undefined}
    />
  );
}

/** The card itself (one SVG, so it downloads as a PNG) and its share buttons. */
export function IdCard({ name, address, path, cards, points, rarest, crop }: {
  name?: string;
  /** null in demo. */
  address: Address | null;
  /** Where the QR and link go, e.g. "/@ptk". */
  path: string;
  cards: number | null;
  points: string | null;
  rarest: { rarity: number; ticker: string } | null;
  crop?: CardAvatarCrop;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const origin = useSyncExternalStore(subscribeNoop, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const url = `${origin}${path}`;
  const qr = useMemo(() => (origin ? qrPath(url) : null), [origin, url]);
  const title = name ? `@${name}` : address ? short(address) : "Demo collector";

  // Avatar placement inside its circle, matching the saved crop.
  const avatarImage = (() => {
    if (!crop) return null;
    const href = crop.image ?? artOf(crop.ticker, crop.rarity, crop.tier)?.src;
    if (!href) return null;
    const aspect = crop.image ? NFT_ASPECT : CARD_ASPECT;
    const c = clampCrop(crop.x, crop.y, crop.zoom, aspect);
    const w = (AVATAR.d * crop.zoom) / 100;
    return {
      href,
      x: AVATAR.x + (AVATAR.d * (50 - (c.x / 10_000) * crop.zoom)) / 100,
      y: AVATAR.y + (AVATAR.d * (50 - (c.y / 10_000) * crop.zoom * aspect)) / 100,
      w,
      h: w * aspect,
      fit: "xMidYMid slice",
    };
  })();

  async function download() {
    const el = svg.current;
    if (!el) return;
    setSaving(true);
    setNote(null);
    try {
      const copy = el.cloneNode(true) as SVGSVGElement;
      // Inline images so the canvas can draw them; drop any that won't load.
      for (const img of Array.from(copy.querySelectorAll("image"))) {
        const href = img.getAttribute("href");
        const data = href ? await inline(new URL(href, window.location.href).toString()) : null;
        if (data) img.setAttribute("href", data);
        else {
          img.remove();
          setNote("The NFT picture couldn't be included in the image; it shows on your profile.");
        }
      }
      copy.setAttribute("width", String(W * 2));
      copy.setAttribute("height", String(H * 2));
      const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" });
      const src = URL.createObjectURL(blob);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("render"));
        image.src = src;
      });
      const canvas = document.createElement("canvas");
      canvas.width = W * 2;
      canvas.height = H * 2;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      URL.revokeObjectURL(src);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) throw new Error("png");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = `collect-id-${name ?? address?.slice(2, 8) ?? "demo"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1_000);
    } catch {
      setNote("Couldn't make the image. Try again, or take a screenshot.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      setNote(url);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} on Grailio`, url });
      } catch {
        // Cancelled: nothing to do.
      }
    } else void copyLink();
  }

  /** Equal action tiles: icon over a short label; the border lights up and a faint fill shows on hover. */
  const tile = "flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-md border border-border px-2 py-3 text-xs transition-colors hover:border-black hover:bg-surface-muted disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-transparent";

  return (
    <div>
      {/* Hovered with a mouse, the pointer (0–1) moves the rainbow across the card and its watermark (.id-card in globals.css). */}
      <div
        className="id-card"
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") return;
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--px", String((e.clientX - r.left) / r.width));
          e.currentTarget.style.setProperty("--py", String((e.clientY - r.top) / r.height));
        }}
        onPointerLeave={(e) => { e.currentTarget.style.setProperty("--px", ".5"); e.currentTarget.style.setProperty("--py", ".5"); }}
      >
      <svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" style={{ borderRadius: "inherit" }} role="img" aria-label={`Grailio ID card for ${title}: ${cards ?? 0} cards${points !== null ? `, ${points} points` : ""}. QR code links to ${url}.`}>
        <defs>
          <clipPath id="id-avatar"><rect x={AVATAR.x} y={AVATAR.y} width={AVATAR.d} height={AVATAR.d} /></clipPath>
        </defs>
        {/* Plain white card stock. */}
        <rect width={W} height={H} rx={R} fill="#f6f5f1" />
        {/* The mark as a large, faint watermark in the middle, behind everything else. */}
        <svg x={W / 2 - 160} y={H / 2 - 160} width="320" height="320" viewBox="0 0 100 100" aria-hidden="true"><path d={GRAILIO_MARK} fill={INK} fillOpacity="0.045" fillRule="evenodd" /></svg>

        {/* Header: the Grailio mark alone on the left, the holder on the right. */}
        <svg x="33" y="21" width="44" height="44" viewBox="0 0 100 100"><path d={GRAILIO_MARK} fill={INK} fillRule="evenodd" /></svg>
        <text x={W - 40} y="53" textAnchor="end" fill={INK} fontSize="20" fontWeight="500" letterSpacing="-0.2" fontFamily={FONT}>{title.toUpperCase()}</text>

        {/* Who: label / value rows. */}
        {(
          [
            ["NAME:", name ? `@${name}` : "—"],
            ["WALLET:", address ? short(address) : "DEMO"],
            ["NETWORK:", "AVALANCHE"],
            ["WEB:", url.replace(/^https?:\/\//, "").toUpperCase()],
          ] as const
        ).map(([k, v], i) => (
          <g key={k} fill={INK} fontSize="15" fontWeight="500" fontFamily={FONT}>
            <text x="40" y={138 + i * 26} letterSpacing="0.4">{k}</text>
            <text x="140" y={138 + i * 26} letterSpacing="0.2">{v.length > 26 ? `${v.slice(0, 25)}…` : v}</text>
          </g>
        ))}

        {/* Collection: an outlined box with a header row, in mono. */}
        <rect x="40.5" y="252.5" width="300" height="107" fill="none" stroke={INK} strokeWidth="1.25" />
        <line x1="40.5" y1="280.5" x2="340.5" y2="280.5" stroke={INK} strokeWidth="1.25" />
        <text x="190.5" y="272" textAnchor="middle" fill={INK} fontSize="14" fontWeight="700" letterSpacing="0.6" fontFamily={MONO}>COLLECTION</text>
        <g fill={INK} fontSize="14" fontWeight="500" letterSpacing="0.2" fontFamily={MONO}>
          {(
            [
              ["CARDS:", cards !== null ? String(cards) : "…"],
              ["POINTS:", points ?? "—"],
              ["RAREST:", rarest ? `${RARITY_NAMES[rarest.rarity]} ${rarest.ticker}`.toUpperCase() : "—"],
            ] as const
          ).map(([k, v], i) => (
            <g key={k}>
              <text x="54" y={305 + i * 22}>{k}</text>
              <text x="130" y={305 + i * 22}>{v}</text>
            </g>
          ))}
        </g>

        {/* Picture on top, QR below: one block with a shared outline and a rule between. */}
        <rect x={AVATAR.x} y={AVATAR.y} width={AVATAR.d} height={AVATAR.d} fill="#e7e5df" />
        {avatarImage ? (
          <image href={avatarImage.href} x={avatarImage.x} y={avatarImage.y} width={avatarImage.w} height={avatarImage.h} preserveAspectRatio={avatarImage.fit} clipPath="url(#id-avatar)" />
        ) : (
          <text x={AVATAR.x + AVATAR.d / 2} y={AVATAR.y + AVATAR.d / 2 + 10} textAnchor="middle" fill="#8a8a8e" fontSize="28" fontFamily={FONT}>{(name ?? address?.slice(2) ?? "demo").slice(0, 2).toUpperCase()}</text>
        )}
        <rect x={COL.x} y={COL.y + COL.w} width={COL.w} height={COL.w} fill="#fff" />
        {qr && (
          <svg x={QR.x} y={QR.y} width={QR.size} height={QR.size} viewBox={`0 0 ${qr.n} ${qr.n}`} shapeRendering="crispEdges">
            <path d={qr.d} fill={INK} />
          </svg>
        )}
        <line x1={COL.x} y1={COL.y + COL.w} x2={COL.x + COL.w} y2={COL.y + COL.w} stroke={INK} strokeWidth="1.25" />
        <rect x={COL.x} y={COL.y} width={COL.w} height={COL.w * 2} fill="none" stroke={INK} strokeWidth="1.25" />
      </svg>
        {/* Rainbow reflection in the shape of the watermark. Outside the SVG, so "Download" saves the plain card. */}
        <span className="id-card-holo" style={{ maskImage: MARK_MASK, WebkitMaskImage: MARK_MASK }} aria-hidden="true" />
        {/* A fainter rainbow band sweeping the whole card with the pointer. */}
        <span className="id-card-sheen" aria-hidden="true" />
      </div>

      <div className={cn("mt-4 grid gap-2", address ? "grid-cols-4" : "grid-cols-3")}>
        <button type="button" className={tile} aria-label="Download image" onClick={() => void download()} disabled={saving || !qr}><DownloadSimpleIcon size={18} /> {saving ? "Making…" : "Download"}</button>
        <button type="button" className={tile} onClick={() => void copyLink()} disabled={!origin}>{copied ? <><CheckIcon size={18} /> Copied</> : <><CopyIcon size={18} /> Copy link</>}</button>
        <button type="button" className={tile} onClick={() => void share()} disabled={!origin}><ShareNetworkIcon size={18} /> Share</button>
        {address && <Link className={tile} href={path} aria-label="Open profile page"><ArrowUpRightIcon weight="bold" size={18} /> Open</Link>}
      </div>
      {note && <p className="mt-3 text-sm break-all text-muted" role="status">{note}</p>}
    </div>
  );
}
