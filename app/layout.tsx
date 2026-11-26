import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono, Outfit, Syne } from "next/font/google";
import "./globals.css";

import { Splash } from "@/components/splash";

import { Providers } from "./providers";

/** Body text: DM Sans. */
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

/** Titles (h1–h3): Outfit (see the base layer in globals.css). */
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

/** Numbers (prices, balances, odds, counts): see `.tabular-nums` in globals.css. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** The "grailio" wordmark: Syne, a wide, bold modern sans (.wordmark in globals.css). */
const brandFont = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: "700",
});

const description = "Open packs, collect token cards and trade them on BNB Chain. Public beta.";

/** Link previews use app/opengraph-image.jpg and app/twitter-image.jpg (the mark on the glow, square). */
export const metadata: Metadata = {
  /** Set NEXT_PUBLIC_SITE_URL to the deployed origin so link previews resolve. */
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "Grailio",
  description,
  openGraph: { title: "Grailio", description, siteName: "Grailio", type: "website" },
  twitter: { card: "summary", title: "Grailio", description },
};

/** Draw under the iOS status bar so the hero glow runs to the top edge; the header pads itself by the safe-area inset. */
export const viewport: Viewport = {
  viewportFit: "cover",
  /** iOS Safari paints its status-bar strip in this colour (the page background); the glow eases in under it. */
  themeColor: "#111111",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${outfit.variable} ${geistMono.variable} ${brandFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Splash />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
