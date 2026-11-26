import type { Metadata } from "next";

import { CommunityView } from "@/components/community-view";
import { PageShell } from "@/components/page-shell";
import { chatLive } from "@/lib/contracts";

export const metadata: Metadata = {
  title: "Community — grailio",
  description: "An open lounge, plus a room for each token's card holders.",
};

export default function CommunityPage() {
  return <PageShell app><CommunityView live={chatLive} /></PageShell>;
}
