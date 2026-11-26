/**
 * Server-side lookups for "any NFT you own" profile pictures.
 *
 * BNB Chain has no free, keyless NFT index, and this server never fetches an
 * arbitrary token URI itself (a token URI could point anywhere, including
 * internal addresses). So outside NFTs are switched off: listNfts returns
 * nothing and getNft returns null. Grailio cards still work as profile
 * pictures, since their art comes from the app itself. To bring outside NFTs
 * back, plug an NFT indexer (with its own key) into these two functions.
 */
const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

export type NftItem = {
  nft: string;
  tokenId: string;
  /** Collection name, e.g. "Leftside Ape Yacht Club". */
  collection: string;
  /** Token name if the metadata has one. */
  name: string | null;
  /** https image link, or null if none could be resolved. */
  image: string | null;
};

/** Normalises an image URI to an https link (ipfs:// goes through a public gateway). */
export function safeImage(uri: unknown): string | null {
  if (typeof uri !== "string" || !uri) return null;
  const trimmed = uri.trim();
  if (trimmed.startsWith("ipfs://")) return IPFS_GATEWAY + trimmed.slice(7).replace(/^ipfs\//, "");
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** ERC-721s held by `owner` on BNB Chain: none until an NFT indexer is configured. */
export async function listNfts(owner: string): Promise<NftItem[]> {
  void owner;
  return [];
}

/** One NFT's collection, name and image: unavailable until an NFT indexer is configured. */
export async function getNft(nft: string, tokenId: string): Promise<NftItem | null> {
  void nft;
  void tokenId;
  return null;
}
