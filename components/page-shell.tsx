import type { ReactNode } from "react";

import { cn, pageColumn } from "@/components/clean-ui";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * Header, gutter-padded main column and footer shared by every page. `app`
 * pages (community) instead fill the viewport below the header, with no footer.
 */
export function PageShell({ children, app = false }: { children: ReactNode; app?: boolean }) {
  if (app) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden text-black">
        <SiteHeader />
        <main id="main-content" className={cn(pageColumn, "min-h-0 flex-1 pb-2 desk:pb-6")}>{children}</main>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col text-black">
      <SiteHeader />
      {/* The content grows, so the footer sits at the bottom of the screen on short pages. */}
      <main id="main-content" className={cn(pageColumn, "flex flex-1 flex-col")}>
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </main>
    </div>
  );
}
