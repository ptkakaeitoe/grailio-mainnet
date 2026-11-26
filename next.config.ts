import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No floating dev badge: it covers the phone tab bar in previews and screenshots.
  devIndicators: false,
  /**
   * @coinbase/cdp-sdk reaches wagmi's dependency tree via the Base Account
   * connector, which RainbowKit imports unconditionally. It references its
   * optional @x402/* peers (x402 payments — unused here), which are not
   * installed and would otherwise fail the server bundle.
   */
  serverExternalPackages: ["@coinbase/cdp-sdk"],
  /** Next 16 only serves listed qualities: 75 is the default, 90 keeps cropped profile pictures sharp. */
  images: { qualities: [75, 90] },
  /**
   * Public profiles live at /@handle. A folder named "@…" is a parallel-route
   * slot in the App Router, so the page sits at /u/[handle] and this serves it
   * under the @ URL without changing the address bar.
   */
  async rewrites() {
    return [{ source: "/@:handle", destination: "/u/:handle" }];
  },
};

export default nextConfig;
