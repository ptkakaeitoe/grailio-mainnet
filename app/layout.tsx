import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Syne } from "next/font/google";
import "./globals.css";

import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Grailio",
  description,
  openGraph: { title: "Grailio", description, siteName: "Grailio", type: "website" },
  twitter: { card: "summary", title: "Grailio", description },
};

/** Draw under the iOS status bar so the hero glow runs to the top edge; the header pads itself by the safe-area inset. */
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${brandFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
