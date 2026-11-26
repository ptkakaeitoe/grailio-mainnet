/**
 * One readable line for a failed wallet transaction. Wallet errors carry a
 * `shortMessage`; a few common ones get plainer wording.
 */
export function txErrorMessage(error: unknown, fallback = "Transaction failed."): string {
  const short =
    error && typeof error === "object" && "shortMessage" in error ? String(error.shortMessage) : "";
  const text = `${short} ${error instanceof Error ? error.message : ""}`.toLowerCase();
  if (text.includes("nonce too low") || text.includes("nonce has already been used")) {
    return "Your wallet is a step behind the network. Wait a few seconds and try again.";
  }
  if (text.includes("user rejected") || text.includes("user denied")) return "Cancelled in your wallet.";
  // Not enough BNB to pay the network fee (viem: InsufficientFundsError; nodes: "insufficient funds for gas").
  if (text.includes("insufficient funds") || text.includes("exceeds the balance of the account") || text.includes("gas required exceeds allowance")) {
    return "Not enough BNB for gas. Add a little BNB to your wallet (0.01 is plenty) and try again.";
  }
  if (text.includes("stale price")) return "Prices are refreshing. Try again in a moment.";
  if (text.includes("pooltoosmall")) return "Sold out: the prize pool can't cover more packs of this tier yet.";
  if (text.includes("nothingtosweep")) return "Nothing to sweep: the pool is at or below its target.";
  return short || fallback;
}
