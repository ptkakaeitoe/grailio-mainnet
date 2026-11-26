import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DaoWorkspace } from "@/components/dao-workspace";
import { PageShell } from "@/components/page-shell";
import { DAO_VISIBLE } from "@/lib/collect-dao";

export const metadata: Metadata = {
  title: "DAO — grailio",
  description: "Propose and vote on Grailio with points earned from packs.",
};

export default function DaoPage() {
  // Hidden for now: /dao is a 404 until DAO_VISIBLE is turned back on.
  if (!DAO_VISIBLE) notFound();
  return (
    <PageShell>
      <DaoWorkspace />
    </PageShell>
  );
}
