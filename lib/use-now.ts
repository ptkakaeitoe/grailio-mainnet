"use client";

import { useEffect, useState } from "react";

/** Unix seconds, ticking every `intervalMs`: keeps render pure while expiry checks stay current. */
export function useNowSeconds(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
