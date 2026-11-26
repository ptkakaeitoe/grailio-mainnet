"use client";

import { useSyncExternalStore } from "react";

import { EMPTY_SOCIALS, type Socials } from "@/lib/socials";

/**
 * The demo wallet's profile: username, bio, socials and a picture cropped from
 * a demo card. Saved in this browser (localStorage) until the on-chain
 * profile contracts are deployed; same rules as the contracts.
 */
export type DemoProfile = {
  name: string;
  bio: string;
  socials: Socials;
  /** Picture: a demo card's art (by ticker) and its crop. */
  avatar: { ticker: string; rarity?: number; tier?: number; x: number; y: number; zoom: number } | null;
};

const KEY = "collect-demo-profile-v1";
const EMPTY: DemoProfile = { name: "", bio: "", socials: EMPTY_SOCIALS, avatar: null };

let cache: DemoProfile | null = null;
const listeners = new Set<() => void>();

function read(): DemoProfile {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<DemoProfile>) } : EMPTY;
  } catch {
    cache = EMPTY; // private mode or bad data: start empty
  }
  return cache;
}

function write(next: DemoProfile) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the profile still works for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The demo profile plus setters; every component using it updates together. */
export function useDemoProfile() {
  const profile = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    profile,
    update: (patch: Partial<DemoProfile>) => write({ ...read(), ...patch }),
    reset: () => write(EMPTY),
  };
}
