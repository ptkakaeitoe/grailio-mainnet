"use client";

import { useEffect } from "react";

/**
 * Plays each `.reveal` element's pop-in once, when it first scrolls into view (globals.css). It marks <html> with
 * data-reveal first, so without JavaScript (or with reduced motion) nothing is ever hidden. Renders nothing.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    root.setAttribute("data-reveal", "");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-shown", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    document.querySelectorAll(".reveal:not([data-shown])").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return null;
}
