import type { Metadata } from "next";
import { ProfileWorkspace } from "@/components/profile-workspace";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "Profile — grailio",
  description: "Your wallet, holdings and card collection on BNB Chain.",
};

export default function ProfilePage() {
  return (
    <PageShell>
      <ProfileWorkspace />
    </PageShell>
  );
}
