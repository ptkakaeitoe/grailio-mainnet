import type { Metadata } from "next";
import { CollectionEditions } from "@/components/collection-editions";
import { PackPanel } from "@/components/pack-panel";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "Packs — grailio",
  description: "Open mystery packs and see your pack shelf on BNB Chain.",
};

export default function PacksPage() {
  return (
    <PageShell>
      <div className="pb-16">
        {/* Starts at the same top padding as every page; the shelf follows after a short gap. */}
        <section id="play" className="flex flex-col pt-6 pb-16 desk:pt-10 desk:pb-24" aria-labelledby="packs-title">
          <h1 id="packs-title" className="sr-only">Packs</h1>
          <PackPanel />
        </section>
        <section id="packs" className="border-t border-border pt-8 desk:pt-10" aria-labelledby="shelf-title">
          <CollectionEditions />
        </section>
      </div>
    </PageShell>
  );
}
