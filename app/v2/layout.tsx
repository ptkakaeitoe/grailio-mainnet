import type { Metadata } from "next";
import { V2Shell } from "@/components/v2-shell";
import "./v2.css";

export const metadata: Metadata = { title: "Dev UI — grailio" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <V2Shell>{children}</V2Shell>;
}
