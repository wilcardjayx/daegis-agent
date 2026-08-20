#!/usr/bin/env bash
#
# plant_approval.sh — demo helper.
#
# Has the GuardedAccount owner (EOA-2) route an unlimited approve() of the
# DrainerSpender through GuardedAccount.execute(), so the emitted Approval event's
# owner is the GuardedAccount address (not the EOA). That is what trips the loop's
# auto-revoke whitelist during a live demo.
#
# Run by name from anywhere in the repo:
#   ./scripts/plant_approval.sh
#
# The private key is read from .env (DEMO_OWNER_PRIVATE_KEY) and never printed.
# The inner approve() calldata is derived fresh with `cast calldata`, and the full
# execute() is dry-run with `cast call` first — the script aborts before
# broadcasting if the simulation reverts, so a bad state can never burn gas.
set -euo pipefail

# Resolve repo root from this script's location so it works from any cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RPC="https://testrpc.xlayer.tech/terigon"
GUARDED="0x273650d9001F1C7dD6Ba098C22cBA045743c9DDf"   # GuardedAccount
TOKEN="0x28EF702C621DD0B82Ae5bB0753C3A3C1D875a20E"     # DEMO_TOKEN (MockERC20)
DRAINER="0xe9eb89da7a2dF4Bd1A644d737bAEFf1dDE87F7D5"   # DrainerSpender
OWNER="0x7283B95fd7cEd1189B0751108F466f19Ef4D1Da3"     # EOA-2, GuardedAccount owner

# Private key from .env — never echoed.
KEY="$(grep '^DEMO_OWNER_PRIVATE_KEY=' .env | cut -d= -f2)"
if [ -z "$KEY" ]; then
  echo "ERROR: DEMO_OWNER_PRIVATE_KEY not found in $ROOT/.env" >&2
  exit 1
fi

# Inner approve(drainer, MAX_UINT256), derived fresh so nothing is hand-encoded.
APPROVE="$(cast calldata "approve(address,uint256)" "$DRAINER" "$(cast max-uint)")"

echo "GuardedAccount : $GUARDED"
echo "token          : $TOKEN"
echo "spender/drainer: $DRAINER"
echo "inner calldata : $APPROVE"
echo

# Dry-run the full execute() as the owner. Abort before broadcasting if it reverts.
echo "== dry-run execute() (no broadcast) =="
if ! cast call "$GUARDED" "execute(address,uint256,bytes)(bytes)" \
      "$TOKEN" 0 "$APPROVE" --from "$OWNER" --rpc-url "$RPC"; then
  echo "ERROR: dry-run reverted — not broadcasting." >&2
  exit 1
fi
echo "dry-run OK."
echo

# Broadcast for real.
echo "== broadcasting execute() =="
cast send "$GUARDED" "execute(address,uint256,bytes)" \
  "$TOKEN" 0 "$APPROVE" \
  --private-key "$KEY" \
  --rpc-url "$RPC"

echo
echo "Done. The Approval event's owner is $GUARDED — the loop's auto-revoke path."
echo "Verify allowance:"
echo "  cast call $TOKEN 'allowance(address,address)(uint256)' $GUARDED $DRAINER --rpc-url $RPC"
