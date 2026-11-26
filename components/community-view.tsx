"use client";

import { CommunityWorkspace } from "@/components/community-workspace";
import { CommunityPreview, DemoCommunity } from "@/components/demo-community";
import { useDemo } from "@/components/demo-provider";

/** Demo chat in demo mode; on-chain chat once CollectChat is deployed; a preview before. */
export function CommunityView({ live }: { live: boolean }) {
  const demo = useDemo();
  if (demo.active) return <DemoCommunity />;
  return live ? <CommunityWorkspace /> : <CommunityPreview />;
}
