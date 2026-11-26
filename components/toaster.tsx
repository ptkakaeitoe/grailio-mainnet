"use client";

import { ArrowUpRightIcon, CheckIcon, CircleNotchIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useSyncExternalStore } from "react";
import { cn } from "@/components/clean-ui";
import { dismissToast, readToasts, serverToasts, subscribeToasts } from "@/lib/toast";

/** Notifications from lib/toast, stacked at the bottom right (bottom on phones). */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, readToasts, serverToasts);
  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className="pointer-events-auto flex w-full max-w-[360px] animate-[popover-in_.15s_ease-out] items-start gap-3 rounded-md border border-border bg-white/72 py-3 pr-2 pl-3.5 shadow-[0_12px_30px_#0000001a] backdrop-blur-[14px]"
        >
          <span
            className={cn(
              "mt-1 grid size-5 shrink-0 place-items-center rounded-full",
              t.kind === "success" && "bg-black text-white",
              t.kind === "error" && "bg-down text-white",
            )}
            aria-hidden="true"
          >
            {t.kind === "loading" ? <CircleNotchIcon className="size-4 animate-spin text-muted" /> : t.kind === "success" ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm leading-7">{t.title}</span>
            {t.detail && <span className="block text-[13px] break-words text-muted">{t.detail}</span>}
            {t.href && (
              <a className="mt-1 inline-flex items-center gap-1 text-[13px] text-muted underline-offset-4 hover:text-black hover:underline" href={t.href} target="_blank" rel="noreferrer">
                View transaction <ArrowUpRightIcon weight="bold" className="size-3" />
              </a>
            )}
          </span>
          <button type="button" className="grid size-7 shrink-0 place-items-center rounded text-muted hover:bg-surface-muted hover:text-black" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
