import Image from "next/image";
import { artOf } from "@/lib/cards";
import type { CSSProperties, ReactNode } from "react";


/** Card art is 2:3, so it is 1.5× as tall as it is wide. */
export const CARD_ASPECT = 1.5;
/** NFT images are treated as square (cropped to cover). */
export const NFT_ASPECT = 1;

/**
 * Keeps the focus point far enough from the edges that the image always
 * covers the circle at this zoom. Coordinates are basis points of the image.
 */
export function clampCrop(x: number, y: number, zoom: number, aspect = CARD_ASPECT) {
  const w = zoom; // image width, % of the avatar
  const h = zoom * aspect;
  const clamp = (v: number, size: number) => Math.min(Math.max(v, (50 / size) * 10_000), ((size - 50) / size) * 10_000);
  return { x: Math.round(clamp(x, w)), y: Math.round(clamp(y, h)), zoom };
}

/** Positions the image so the focus point sits in the middle of the avatar. */
export function cropStyle(x: number, y: number, zoom: number, aspect = CARD_ASPECT): CSSProperties {
  const c = clampCrop(x, y, zoom, aspect);
  return {
    position: "absolute",
    width: `${zoom}%`,
    maxWidth: "none",
    // Always a 2:3 (or square) box that the image covers, so art of a slightly different shape never leaves a gap.
    height: `${zoom * aspect}%`,
    objectFit: "cover",
    left: `${50 - (c.x / 10_000) * zoom}%`,
    top: `${50 - (c.y / 10_000) * zoom * aspect}%`,
  };
}

/** A round avatar cropped from a Grailio card's art or any NFT's image, or the fallback (initials). */
export function CardAvatar({
  crop,
  fallback,
  className,
  sizes = "64px",
}: {
  /** `image` set: an NFT avatar (square crop). Otherwise `ticker` picks the card art. */
  crop?: { ticker: string; rarity?: number; tier?: number; image?: string | null; x: number; y: number; zoom: number };
  fallback: ReactNode;
  className?: string;
  sizes?: string;
}) {
  const frame: CSSProperties = { position: "absolute", inset: 0, display: "block", overflow: "hidden", borderRadius: "50%" };
  if (crop?.image) {
    return (
      <span className={className} style={frame}>
        {/* Arbitrary NFT hosts, so a plain img rather than next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={crop.image} alt="" loading="lazy" referrerPolicy="no-referrer" style={cropStyle(crop.x, crop.y, crop.zoom, NFT_ASPECT)} draggable={false} />
      </span>
    );
  }
  const art = crop && artOf(crop.ticker, crop.rarity, crop.tier);
  if (!crop || !art) return <>{fallback}</>;
  // The art is drawn at zoom% of the avatar's width, so ask for an image that wide
  // (not just the avatar's size), up to the 1024px source: otherwise it's upscaled and soft.
  const avatarPx = Number(/(\d+)px/.exec(sizes)?.[1] ?? 64);
  const artSizes = `${Math.min(1024, Math.ceil((avatarPx * crop.zoom) / 100))}px`;
  return (
    // Fills the (position: relative) avatar it sits in; the art is placed inside it.
    <span className={className} style={frame}>
      <Image src={art.src} alt="" width={1024} height={1536} sizes={artSizes} quality={90} style={cropStyle(crop.x, crop.y, crop.zoom)} draggable={false} />
    </span>
  );
}
