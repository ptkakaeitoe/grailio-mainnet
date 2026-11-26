"use client";

import { ArrowCounterClockwiseIcon, SignOutIcon } from "@phosphor-icons/react/ssr";

import { useDemo } from "@/components/demo-provider";

const control = "inline-flex items-center gap-1.5 text-sm text-muted underline-offset-4 transition-colors hover:text-black hover:underline";

/** Reset / Exit demo, in the site footer while demo mode is on. */
export function DemoFooterControls() {
  const demo = useDemo();
  if (!demo.active) return null;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 pb-8">
      <button type="button" className={control} onClick={() => { if (window.confirm("Reset demo? Your demo wallet, cards, packs, listings, chat and DAO votes start over. Your demo profile stays.")) demo.reset(); }}>
        <ArrowCounterClockwiseIcon size={14} /> Reset demo
      </button>
      <button type="button" className={control} onClick={demo.exit}>
        <SignOutIcon size={14} /> Exit demo
      </button>
    </div>
  );
}
