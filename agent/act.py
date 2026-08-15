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

On-chain writes go through the OKX TEE agentic wallet via `onchainos wallet
contract-call` (Phase 5). After the rotation, the TEE wallet is BOTH the
ThreatRegistry agent (record) and the GuardedAccount guardian (revoke), so a
single identity writes verdicts and revokes approvals — and the loop holds no
private key for either. The signing key lives in OKX's TEE; the CLI signs there.
Calldata is still built locally and keylessly with `cast calldata`. This is the
same "shell out to a trusted CLI" pattern as okx_client.py.

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
    """An on-chain write (or a local helper) failed. Never swallowed: a verdict
    that could not be recorded/revoked must surface, not be treated as handled."""


# ---------------------------------------------------------------------------
# Local, keyless cast (Foundry) helpers — keccak and calldata only
# ---------------------------------------------------------------------------

_CAST_TIMEOUT_S = 120
_ONCHAINOS_TIMEOUT_S = 180

#: How long to wait for a TEE UserOp to mine before giving up. X Layer blocks are
#: ~1 s; a UserOp is normally mined within a few. The wait is what lets record and
#: revoke run sequentially without racing the smart account's nonce.
_RECEIPT_ATTEMPTS = 24
_RECEIPT_DELAY_S = 3.0


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


# ---------------------------------------------------------------------------
# TEE agentic wallet write seam (onchainos wallet contract-call)
# ---------------------------------------------------------------------------


def _wait_for_success(tx_hash: str) -> None:
    """Poll for the receipt of a TEE UserOp and confirm it mined successfully.

    contract-call returns as soon as the UserOp is broadcast, not when it mines.
    Waiting here does two jobs: it surfaces an on-chain revert as an ActError
    (rather than a silently-dropped verdict), and it serialises record-then-revoke
    so two UserOps from the same smart account never race on its nonce.
    """
    for _ in range(_RECEIPT_ATTEMPTS):
        proc = subprocess.run(
            [config.CAST_BIN, "receipt", tx_hash, "--rpc-url", config.XLAYER_TESTNET_RPC, "--json"],
            capture_output=True,
            text=True,
            timeout=_CAST_TIMEOUT_S,
            check=False,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            try:
                receipt = json.loads(proc.stdout)
            except json.JSONDecodeError:
                receipt = {}
            status = receipt.get("status")
            if status in ("0x1", 1, "1"):
                return
            if status in ("0x0", 0, "0"):
                raise ActError(f"TEE tx {tx_hash} reverted (status {status})")
        time.sleep(_RECEIPT_DELAY_S)
    raise ActError(
        f"TEE tx {tx_hash} not mined after "
        f"{_RECEIPT_ATTEMPTS * _RECEIPT_DELAY_S:.0f}s"
    )


def _tee_send(to: str, signature: str, args: list[str]) -> str:
    """Execute a state-changing call FROM the TEE agentic wallet, returning the
    confirmed transaction hash.

    The TEE wallet signs inside OKX's TEE — this process holds no key for it.
    Calldata is encoded locally and keylessly with `cast calldata`, then handed to
    `onchainos wallet contract-call`, which builds and broadcasts the ERC-4337
    UserOp. We then wait for the receipt (see `_wait_for_success`).
    """
    calldata = _run_cast(["calldata", signature, *args]).strip()
    if not (calldata.startswith("0x") and len(calldata) > 2):
        raise ActError(f"cast calldata produced nothing for {signature!r}: {calldata!r}")

    if not config.TEE_WALLET_ADDRESS:
        raise ActError("TEE_WALLET_ADDRESS is not set (check .env)")

    try:
        proc = subprocess.run(
            [
                config.ONCHAINOS_BIN,
                "wallet",
                "contract-call",
                "--to",
                to,
                "--chain",
                config.XLAYER_TESTNET_CHAIN_NAME,
                "--from",
                config.TEE_WALLET_ADDRESS,
                "--input-data",
                calldata,
                "--force",
            ],
            capture_output=True,
            text=True,
            timeout=_ONCHAINOS_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        raise ActError(f"onchainos contract-call timed out after {_ONCHAINOS_TIMEOUT_S}s") from e
    except FileNotFoundError as e:
        raise ActError(
            f"onchainos not found at {config.ONCHAINOS_BIN!r}; set DAEGIS_ONCHAINOS_BIN"
        ) from e

    # contract-call prints its JSON envelope on stdout for BOTH success and a
    # backend rejection (ok:false), the latter with a nonzero exit — so parse
    # stdout first and only fall back to stderr when there is nothing to parse.
    out = proc.stdout.strip()
    if not out:
        tail = (proc.stderr or "").strip().splitlines()[-4:]
        raise ActError(f"onchainos contract-call produced no output ({proc.returncode}): {tail!r}")
    try:
        payload = json.loads(out)
    except json.JSONDecodeError as e:
        raise ActError(f"onchainos contract-call returned non-JSON: {out[:200]!r}") from e
    if not payload.get("ok"):
        raise ActError(f"onchainos contract-call failed: {payload.get('error')!r}")
    tx_hash = (payload.get("data") or {}).get("txHash")
    if not tx_hash:
        raise ActError(f"onchainos contract-call returned no txHash: {payload}")

    _wait_for_success(tx_hash)
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
    """Apply the verdict to chain. Returns what was done.

    Both writes are issued by the TEE agentic wallet (Phase 5): it is the registry
    agent for `record` and the guardian for `revoke`. No private key is held here.
    """
    if verdict.verdict == "benign":
        emit(f"[act] benign — no registry write, no revoke ({verdict.spender})")
        return ActionResult(verdict="benign", recorded=False, revoked=False)

    if not config.THREAT_REGISTRY_ADDRESS:
        raise ActError("THREAT_REGISTRY_ADDRESS is not set (check .env)")

    reason_hash = keccak_text(verdict.reasoning)
    store_reasoning(verdict, event, reason_hash)

    record_tx = _tee_send(
        config.THREAT_REGISTRY_ADDRESS,
        "record(address,uint8,bytes32)",
        [verdict.spender, str(verdict.risk_score), reason_hash],
    )
    emit(f"[act] recorded {verdict.verdict} risk {verdict.risk_score} for {verdict.spender} (TEE)")
    emit(f"[act]   registry tx {record_tx}")

    revoked = False
    revoke_tx: Optional[str] = None
    if verdict.verdict == "malicious":
        owner = event.owner.lower()
        if owner in config.GUARDED_ACCOUNTS:
            revoke_tx = _tee_send(
                owner,  # the GuardedAccount contract is the approval's owner
                "revoke(address,address)",
                [event.token, event.spender],
            )
            revoked = True
            emit(f"[act] revoked approval on guarded account {owner} (TEE guardian)")
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
