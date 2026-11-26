#!/usr/bin/env bash
# Verify every deployed Grailio contract on BscScan (Etherscan API v2, chain 56),
# reading the addresses from ../deployments/56.json. Safe to re-run: verified
# contracts are skipped by the explorer. Constructor arguments are read from the
# deployment transactions (--guess-constructor-args), so it needs an RPC.
#
#   cd contracts && BSC_RPC_URL=https://bsc-dataseed.bnbchain.org ETHERSCAN_API_KEY=... ./script/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${BSC_RPC_URL:?set BSC_RPC_URL (any BNB Smart Chain RPC)}"
: "${ETHERSCAN_API_KEY:?set ETHERSCAN_API_KEY (an Etherscan API v2 key)}"

deployment="../deployments/56.json"
address_of() {
  python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2], ""))' "$deployment" "$1"
}

# JSON key -> source:contract
pairs=(
  "collectPacks src/CollectPacks.sol:CollectPacks"
  "collectMarket src/CollectMarket.sol:CollectMarket"
  "collectPoints src/CollectPoints.sol:CollectPoints"
  "collectDao src/CollectDAO.sol:CollectDAO"
  "collectChat src/CollectChat.sol:CollectChat"
  "collectNames src/CollectNames.sol:CollectNames"
  "collectProfiles src/CollectProfiles.sol:CollectProfiles"
  "collectStaking src/CollectStaking.sol:CollectStaking"
)

for pair in "${pairs[@]}"; do
  key="${pair%% *}"
  contract="${pair#* }"
  address="$(address_of "$key")"
  if [[ -z "$address" || "$address" == "0x0000000000000000000000000000000000000000" ]]; then
    echo "skip $key: not deployed yet"
    continue
  fi
  echo "verify $key at $address"
  forge verify-contract "$address" "$contract" \
    --chain 56 \
    --verifier etherscan \
    --rpc-url "$BSC_RPC_URL" \
    --guess-constructor-args \
    --watch
done
