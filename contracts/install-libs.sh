#!/usr/bin/env bash
# Fetches the Solidity libraries at the exact revisions in foundry.lock into lib/
# (lib/ is not committed). Run once before `forge build` / `forge test`.
set -euo pipefail
cd "$(dirname "$0")"
fetch() { # dir url rev
  if [[ -d "$1/.git" ]] && [[ "$(git -C "$1" rev-parse HEAD)" == "$3" ]]; then echo "ok $1"; return; fi
  rm -rf "$1" && mkdir -p "$1"
  git -C "$1" init -q && git -C "$1" remote add origin "$2"
  git -C "$1" fetch -q --depth 1 origin "$3" && git -C "$1" checkout -q FETCH_HEAD
  echo "fetched $1 at $3"
}
fetch lib/forge-std https://github.com/foundry-rs/forge-std f3dae6e6ee381f25eb6a246f7da9b85c91a68219
fetch lib/openzeppelin-contracts https://github.com/OpenZeppelin/openzeppelin-contracts c64a1edb67b6e3f4a15cca8909c9482ad33a02b0
