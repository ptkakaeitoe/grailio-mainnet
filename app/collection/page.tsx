import type { Metadata } from "next";
import { CollectionWorkspace } from "@/components/collection-workspace";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "Collection — grailio",
  description: "Your cards and unopened packs: open, stake and redeem.",
};

export default function CollectionPage() {
  return (
    <PageShell>
      <CollectionWorkspace />
    </PageShell>
  );
}
