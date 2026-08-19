"""Phase 4 — the full guarded loop: detect -> decide -> act, unattended.

This is the Phase 2 poller with the Phase 3 verdict and the Phase 4 consequences
wired onto its per-approval callback. Nothing new is detected here — it reuses
detect.follow, which flags unlimited ERC-20 approvals live — but each flag now
flows all the way to a registry record and, for guarded accounts, an on-chain
revoke, with no manual step in between.

    python3 -m agent.loop --follow --max-iterations 200

Per-approval pipeline:
  1. detect flags an unlimited approval (owner -> spender on token).
  2. decide.gather_evidence over [approval_block - LOOKBACK, safe head]:
     selectors, source status, approval/transfer logs, third-party-drain flag.
  3. decide.decide -> {malicious|suspicious|benign} + reasoning.
  4. act.act_on_verdict -> registry record (malicious/suspicious) and, for a
     guarded owner + malicious verdict, GuardedAccount.revoke.

The revoke sets the allowance to zero, which emits Approval(owner, spender, 0).
That is not unlimited, so detect never re-flags it — no feedback loop.
"""
from __future__ import annotations

import argparse
from typing import Optional

from agent import act, config, decide
from agent.detect import ApprovalEvent, JsonRpc, emit, follow, unbuffer_stdout


def _handle_approval(rpc: JsonRpc, event: ApprovalEvent) -> None:
    """The full pipeline for one flagged approval. Exceptions are logged and
    swallowed HERE so one bad spender cannot kill the poller — but each stage
    raises rather than silently passing, so failures are visible in the log."""
    emit("")
    emit(f"[loop] FLAGGED {event.describe()}")
    emit(f"[loop]   tx {event.tx_hash}")

    safe_head = rpc.block_number() - config.CONFIRMATIONS
    from_block = max(0, event.block_number - config.EVIDENCE_LOOKBACK_BLOCKS)

    try:
        evidence = decide.gather_evidence(
            rpc, event.spender, from_block, safe_head, source_verified=None
        )
        emit(
            f"[loop]   evidence: exposed={[decide.decode_selector(s) for s in evidence.exposed_selectors]} "
            f"approvals={len(evidence.approvals)} movements={len(evidence.movements)} "
            f"third_party_drains={sum(1 for m in evidence.movements if m.third_party_drain)}"
        )
        verdict = decide.decide(evidence)
        emit(f"[loop]   VERDICT {verdict.verdict} (risk {verdict.risk_score}): {verdict.reasoning}")

        result = act.act_on_verdict(verdict, event)
        emit(
            f"[loop]   ACTION recorded={result.recorded} revoked={result.revoked}"
            + (f" reasonHash={result.reason_hash}" if result.reason_hash else "")
        )
    except (decide.DecideError, act.ActError) as e:
        emit(f"[loop]   ERROR handling {event.spender}: {e}")


def run(rpc: Optional[JsonRpc] = None, max_iterations: Optional[int] = None,
        start_block: Optional[int] = None) -> None:
    rpc = rpc or JsonRpc()
    chain_id = rpc.chain_id()
    if chain_id != config.XLAYER_TESTNET_CHAIN_ID:
        emit(f"[loop] WARNING: chain {chain_id}, expected {config.XLAYER_TESTNET_CHAIN_ID}")
    emit(f"[loop] guarded accounts (auto-revoke whitelist): {sorted(config.GUARDED_ACCOUNTS)}")
    emit(f"[loop] registry {config.THREAT_REGISTRY_ADDRESS}")

    follow(
        rpc,
        start_block=start_block,
        unlimited_only=True,
        on_event=lambda event: _handle_approval(rpc, event),
        max_iterations=max_iterations,
    )


def main(argv: Optional[list[str]] = None) -> int:
    unbuffer_stdout()
    parser = argparse.ArgumentParser(description="DAegis Phase 4 guarded loop")
    parser.add_argument("--follow", action="store_true", help="poll forward continuously")
    parser.add_argument("--from-block", type=int, help="start block (default: cursor or head)")
    parser.add_argument("--max-iterations", type=int, help="stop after N polls")
    args = parser.parse_args(argv)

    if not args.follow:
        parser.error("Phase 4 loop runs in --follow mode")
    run(max_iterations=args.max_iterations, start_block=args.from_block)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
