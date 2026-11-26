"use client";

import { useEffect, useState } from "react";

import { GRAILIO_MARK } from "@/components/collect-mark";

/** Shortest time the splash stays up, from the start of navigation, so it never just blinks. */
const MIN_MS = 1800;

/**
 * The first-load splash: the grailio mark on the dark canvas, glowing softly while the app loads. It is part of the
 * server-rendered HTML (so it covers the very first paint), fades out once the page and fonts are ready, then unmounts.
 * The root layout never remounts, so client-side navigation never shows it again. Styles and the no-JS fallback (it
 * hides itself after a few seconds regardless) are `.splash` in globals.css.
 */
export function Splash() {
  const [phase, setPhase] = useState<"show" | "hide" | "gone">("show");

  useEffect(() => {
    let cancelled = false;
    const loaded = document.readyState === "complete" ? Promise.resolve() : new Promise<void>((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
    const elapsed = performance.now();
    const minimum = new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, MIN_MS - elapsed)));
    Promise.all([loaded, document.fonts?.ready, minimum]).then(() => {
      if (cancelled) return;
      setPhase("hide");
      // Starts the page's intro animations (.intro in globals.css) as the splash fades.
      document.documentElement.setAttribute("data-splash-done", "");
    });
    return () => { cancelled = true; };
  }, []);

  if (phase === "gone") return null;
  return (
    <div
      className="splash"
      data-hide={phase === "hide" || undefined}
      aria-hidden="true"
      onTransitionEnd={(event) => { if (event.target === event.currentTarget && phase === "hide") setPhase("gone"); }}
    >
      <svg className="splash__mark" viewBox="0 0 100 100" focusable="false">
        <path d={GRAILIO_MARK} fill="currentColor" fillRule="evenodd" />
      </svg>
    </div>
  );
}
