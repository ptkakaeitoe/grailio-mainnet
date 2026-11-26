/**
 * A token amount for display: 4 significant digits below 1 (0.1372, 0.00001019),
 * up to 4 decimals above it (12.3456), with thousands separators.
 */
export const tokenAmount = (n: number) =>
  Math.abs(n) < 1
    ? n.toLocaleString("en-US", { maximumSignificantDigits: 4 })
    : n.toLocaleString("en-US", { maximumFractionDigits: 4 });
