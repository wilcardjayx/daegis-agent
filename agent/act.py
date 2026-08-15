"""Phase 4 — the act half of the loop: verdict -> registry -> guarded revoke.

Given a Verdict (from decide.py) about a flagged approval, this module writes the
consequences to chain:

  malicious  -> record(spender, risk_score, reasonHash) on ThreatRegistry, AND, if
                the approval's owner is a whitelisted guarded account,
                revoke(token, spender) on that GuardedAccount.
  suspicious -> record only. Never revoke.
  benign     -> do nothing. (Design choice, flagged for review: the registry is a
                THREAT feed; recording benign spenders dilutes its signal and costs
                a write per legitimate approval. Phase 6's free-tier alert keys on
                isFlagged(), so benign must stay unflagged.)

On-chain writes shell out to `cast send` (Foundry) rather than signing in-process.
Foundry is already this project's signer for every deploy and send, it handles
nonce/gas, and it avoids pulling a native-secp256k1 Python dependency onto the
aarch64 build phone. This is the same "shell out to a trusted CLI" pattern as
okx_client.py.

The full reasoning text is stored off-chain (config.VERDICT_STORE_DIR), keyed by
the keccak256 hash that is pinned on-chain, so the public page can resolve a hash
back to prose and prove it was not edited after the fact.
"""
from __future__ import annotations

import json
import subprocess
import time
from dataclasses import dataclass
from typing import Optional

from agent import config
from agent.decide import Verdict
from agent.detect import ApprovalEvent, emit


class ActError(RuntimeError):
    """An on-chain write (or the keccak helper) failed. Never swallowed: a verdict
    that could not be recorded/revoked must surface, not be treated as handled."""


# ---------------------------------------------------------------------------
# cast (Foundry) subprocess helpers
# ---------------------------------------------------------------------------

_CAST_TIMEOUT_S = 120


def _run_cast(args: list[str], *, timeout: int = _CAST_TIMEOUT_S) -> str:
    """Invoke `cast <args>` and return stdout. Raise ActError on any failure."""
    try:
        proc = subprocess.run(
            [config.CAST_BIN, *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        raise ActError(f"cast timed out after {timeout}s: {args[:2]}") from e
    except FileNotFoundError as e:
        raise ActError(f"cast not found at {config.CAST_BIN!r}; set DAEGIS_CAST_BIN") from e
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-4:]
        raise ActError(f"cast {args[0]} failed ({proc.returncode}): {tail!r}")
    return proc.stdout


def keccak_text(text: str) -> str:
    """keccak256 of the UTF-8 text, as a 0x bytes32 — the on-chain reasonHash.

    Uses `cast keccak` because keccak256 is not in the Python stdlib (hashlib's
    sha3 is FIPS SHA3, which uses different padding than Ethereum's keccak).
    """
    out = _run_cast(["keccak", text]).strip()
    if not (out.startswith("0x") and len(out) == 66):
        raise ActError(f"cast keccak returned an unexpected value: {out!r}")
    return out


def _cast_send(to: str, signature: str, args: list[str], private_key: str) -> str:
    """`cast send` a state-changing call, returning the transaction hash.

    cast send is synchronous — it waits for the receipt — so sequential sends
    (record then revoke) never race on nonce.
    """
    result = _run_cast(
        [
            "send",
            to,
            signature,
            *args,
            "--rpc-url",
            config.XLAYER_TESTNET_RPC,
            "--private-key",
            private_key,
            "--json",
        ]
    )
    try:
        receipt = json.loads(result)
    except json.JSONDecodeError as e:
        raise ActError(f"cast send returned non-JSON: {result[:200]!r}") from e
    tx_hash = receipt.get("transactionHash")
    status = receipt.get("status")
    if not tx_hash:
        raise ActError(f"cast send receipt had no transactionHash: {receipt}")
    # status is "0x1" success / "0x0" revert on a mined receipt.
    if status not in (None, "0x1", 1, "1"):
        raise ActError(f"transaction {tx_hash} reverted (status {status})")
    return tx_hash


# ---------------------------------------------------------------------------
# Off-chain reasoning store
# ---------------------------------------------------------------------------


def store_reasoning(verdict: Verdict, event: ApprovalEvent, reason_hash: str) -> None:
    """Persist the full verdict, keyed by its on-chain reasonHash."""
    config.VERDICT_STORE_DIR.mkdir(parents=True, exist_ok=True)
    path = config.VERDICT_STORE_DIR / f"{reason_hash}.json"
    path.write_text(
        json.dumps(
            {
                "reason_hash": reason_hash,
                "spender": verdict.spender,
                "verdict": verdict.verdict,
                "risk_score": verdict.risk_score,
                "reasoning": verdict.reasoning,
                "token": event.token,
                "owner": event.owner,
                "flagged_tx": event.tx_hash,
                "flagged_block": event.block_number,
                "recorded_at": time.time(),
            },
            indent=2,
        )
    )


# ---------------------------------------------------------------------------
# Acting on a verdict
# ---------------------------------------------------------------------------


@dataclass
class ActionResult:
    verdict: str
    recorded: bool
    revoked: bool
    reason_hash: Optional[str] = None
    record_tx: Optional[str] = None
    revoke_tx: Optional[str] = None


def act_on_verdict(verdict: Verdict, event: ApprovalEvent) -> ActionResult:
    """Apply the verdict to chain. Returns what was done."""
    if verdict.verdict == "benign":
        emit(f"[act] benign — no registry write, no revoke ({verdict.spender})")
        return ActionResult(verdict="benign", recorded=False, revoked=False)

    private_key = config.env("DEPLOYER_PRIVATE_KEY")  # EOA-1: registry agent AND guardian
    if not private_key:
        raise ActError("DEPLOYER_PRIVATE_KEY is not set (check .env)")
    if not config.THREAT_REGISTRY_ADDRESS:
        raise ActError("THREAT_REGISTRY_ADDRESS is not set (check .env)")

    reason_hash = keccak_text(verdict.reasoning)
    store_reasoning(verdict, event, reason_hash)

    record_tx = _cast_send(
        config.THREAT_REGISTRY_ADDRESS,
        "record(address,uint8,bytes32)",
        [verdict.spender, str(verdict.risk_score), reason_hash],
        private_key,
    )
    emit(f"[act] recorded {verdict.verdict} risk {verdict.risk_score} for {verdict.spender}")
    emit(f"[act]   registry tx {record_tx}")

    revoked = False
    revoke_tx: Optional[str] = None
    if verdict.verdict == "malicious":
        owner = event.owner.lower()
        if owner in config.GUARDED_ACCOUNTS:
            revoke_tx = _cast_send(
                owner,  # the GuardedAccount contract is the approval's owner
                "revoke(address,address)",
                [event.token, event.spender],
                private_key,
            )
            revoked = True
            emit(f"[act] revoked approval on guarded account {owner}")
            emit(f"[act]   revoke tx {revoke_tx}")
        else:
            emit(f"[act] owner {owner} is not a guarded account — recorded but NOT revoked")

    return ActionResult(
        verdict=verdict.verdict,
        recorded=True,
        revoked=revoked,
        reason_hash=reason_hash,
        record_tx=record_tx,
        revoke_tx=revoke_tx,
    )
