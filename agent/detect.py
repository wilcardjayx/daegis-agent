"""Phase 2 — the detect half of the loop.

Polls X Layer for ERC-20 `Approval` events via `eth_getLogs` and filters them
down to unlimited (or effectively unlimited) allowances, which is the single
detector this project ships. See SPEC.md "Non-goals": no mempool watching, and
no second detector.

Design constraints that shaped this file:
  - Stdlib only. `urllib.request` over a JSON-RPC endpoint, no web3.py — the
    dev machine is a 4 GB Android phone in a proot chroot and aarch64 wheels
    for the heavier stacks are a coin flip.
  - The RPC caps `eth_getLogs` at a 100-block span (measured, see config), so
    every scan is chunked. Chunking is not optional and not a tuning knob.
  - Nothing here is mocked. Per CLAUDE.md the detection path is proven against
    live testnet data; the unit tests cover pure decode/filter functions using
    captured real log payloads, and the live proof is a separate scripted run.

Usage:
    python3 -m agent.detect --last 500              # scan recent history
    python3 -m agent.detect --from-block N --to-block M
    python3 -m agent.detect --follow                # live poll from the cursor
    python3 -m agent.detect --last 500 --all        # don't filter to unlimited
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Iterable, Iterator, Optional

from agent import config


def emit(message: str) -> None:
    """Print and flush immediately.

    `follow` runs for hours with its stdout redirected to a file, and Python
    block-buffers a redirected stream. Without the explicit flush the operator
    sees an empty log file the entire time the poller is working, and a SIGTERM
    then discards the buffer entirely — the detections are simply lost. Found
    the hard way during the Phase 2 live run.
    """
    print(message, flush=True)


class RpcError(RuntimeError):
    """The RPC failed to answer a call. Like OnchainosError in okx_client, this
    is never treated as 'nothing found' — a scan that did not complete is not a
    clean scan, and swallowing it would silently blind the detector."""


# ---------------------------------------------------------------------------
# JSON-RPC transport
# ---------------------------------------------------------------------------


class JsonRpc:
    """Minimal JSON-RPC 2.0 client with retry and automatic backup-URL failover.

    CLAUDE.md records a backup RPC for X Layer; this uses it rather than dying
    when the primary hiccups, and says so in the exception when both are gone.
    """

    def __init__(
        self,
        url: str = config.XLAYER_TESTNET_RPC,
        backup_url: str = config.XLAYER_TESTNET_RPC_BACKUP,
        timeout: int = config.RPC_TIMEOUT_SECONDS,
    ) -> None:
        self.urls = [u for u in (url, backup_url) if u]
        self.timeout = timeout
        self._request_id = 0

    def call(self, method: str, params: list[Any]) -> Any:
        self._request_id += 1
        payload = json.dumps(
            {"jsonrpc": "2.0", "id": self._request_id, "method": method, "params": params}
        ).encode()

        last_error: Optional[str] = None
        for url in self.urls:
            for attempt in range(config.RPC_MAX_ATTEMPTS):
                try:
                    req = urllib.request.Request(
                        url, data=payload, headers={"Content-Type": "application/json"}
                    )
                    with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                        body = json.loads(resp.read().decode())
                except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                    last_error = f"{type(e).__name__}: {e}"
                    time.sleep(0.5 * (attempt + 1))
                    continue

                if "error" in body:
                    # An RPC-level error (bad params, range too wide) is a bug in
                    # the caller, not a transport blip. Fail immediately rather
                    # than retrying the same rejected request against the backup.
                    raise RpcError(f"{method} rejected by {url}: {body['error']}")
                return body.get("result")

        raise RpcError(f"{method} failed on all endpoints {self.urls}: {last_error}")

    def block_number(self) -> int:
        return int(self.call("eth_blockNumber", []), 16)

    def chain_id(self) -> int:
        return int(self.call("eth_chainId", []), 16)

    def get_logs(
        self,
        from_block: int,
        to_block: int,
        topics: Optional[list[Any]] = None,
        address: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """One raw getLogs call. Caller is responsible for staying inside the
        RPC's block-span cap — use `scan_range`, which chunks for you."""
        params: dict[str, Any] = {
            "fromBlock": hex(from_block),
            "toBlock": hex(to_block),
        }
        if topics:
            params["topics"] = topics
        if address:
            params["address"] = address
        return self.call("eth_getLogs", [params]) or []


# ---------------------------------------------------------------------------
# Decoding
# ---------------------------------------------------------------------------


def _address_from_topic(topic: str) -> str:
    """A 32-byte topic holds a left-padded address in its low 20 bytes."""
    return "0x" + topic[-40:]


@dataclass(frozen=True)
class ApprovalEvent:
    """One decoded ERC-20 Approval.

    `owner` granted `spender` an allowance of `value` on `token`.
    """

    token: str
    owner: str
    spender: str
    value: int
    block_number: int
    tx_hash: str
    log_index: int
    raw: dict[str, Any] = field(default_factory=dict, repr=False, compare=False)

    @property
    def is_exact_max(self) -> bool:
        """Allowance is exactly type(uint256).max — the textbook infinite approve."""
        return self.value == config.MAX_UINT256

    @property
    def is_unlimited(self) -> bool:
        """Allowance is at or above the effectively-unlimited threshold.

        Covers both the textbook max-uint256 and the 'large enough that no real
        token could ever have that supply' variants. See config for the why.
        """
        return self.value >= config.UNLIMITED_THRESHOLD

    @property
    def is_revocation(self) -> bool:
        """A zero allowance — this is what a revoke looks like on the wire.
        Phase 4 confirms its own revokes by watching for one of these."""
        return self.value == 0

    def explorer_url(self) -> str:
        return config.EXPLORER_TX_URL.format(tx_hash=self.tx_hash)

    def describe(self) -> str:
        if self.is_exact_max:
            amount = "UNLIMITED (max uint256)"
        elif self.is_unlimited:
            amount = f"UNLIMITED (>=2**255): {self.value}"
        elif self.is_revocation:
            amount = "0 (revocation)"
        else:
            amount = str(self.value)
        return (
            f"block {self.block_number} | token {self.token} | "
            f"owner {self.owner} -> spender {self.spender} | allowance {amount}"
        )


def is_erc20_approval(log: dict[str, Any]) -> bool:
    """True only for ERC-20 Approval logs.

    ERC-721 declares `Approval(address owner, address approved, uint256 tokenId)`
    with the tokenId ALSO indexed, so it hashes to the identical topic0 as the
    ERC-20 event. Filtering on topic0 alone therefore pulls in NFT approvals and
    would decode an NFT's tokenId as if it were an allowance — which, for a
    high tokenId, would read as a huge allowance and produce a false positive.

    The two are told apart by shape, not by signature:
      ERC-20  -> 3 topics, value in `data`
      ERC-721 -> 4 topics, empty `data`
    """
    topics = log.get("topics") or []
    if len(topics) != 3:
        return False
    if topics[0].lower() != config.APPROVAL_TOPIC0.lower():
        return False
    data = log.get("data") or "0x"
    return len(data) >= 66  # "0x" + at least one 32-byte word


def decode_approval(log: dict[str, Any]) -> ApprovalEvent:
    """Decode a raw ERC-20 Approval log. Caller must have checked is_erc20_approval."""
    topics = log["topics"]
    return ApprovalEvent(
        token=log["address"].lower(),
        owner=_address_from_topic(topics[1]).lower(),
        spender=_address_from_topic(topics[2]).lower(),
        value=int(log["data"][:66], 16),
        block_number=int(log["blockNumber"], 16),
        tx_hash=log["transactionHash"],
        log_index=int(log["logIndex"], 16),
        raw=log,
    )


def decode_approvals(logs: Iterable[dict[str, Any]]) -> list[ApprovalEvent]:
    """Decode every ERC-20 Approval in `logs`, skipping ERC-721 lookalikes."""
    return [decode_approval(log) for log in logs if is_erc20_approval(log)]


def filter_unlimited(events: Iterable[ApprovalEvent]) -> list[ApprovalEvent]:
    """THE Phase 2 detector: keep only effectively-unlimited allowances."""
    return [e for e in events if e.is_unlimited]


# ---------------------------------------------------------------------------
# Scanning
# ---------------------------------------------------------------------------


def block_chunks(
    from_block: int, to_block: int, size: int = config.MAX_LOG_RANGE_BLOCKS
) -> Iterator[tuple[int, int]]:
    """Split an inclusive block range into spans the RPC will actually accept.

    The cap is on `toBlock - fromBlock`, so a span of `size` covers size+1
    blocks. Yields nothing when the range is empty (to < from), which is the
    normal state of a caught-up poller.
    """
    start = from_block
    while start <= to_block:
        end = min(start + size, to_block)
        yield start, end
        start = end + 1


def scan_range(
    rpc: JsonRpc,
    from_block: int,
    to_block: int,
    token: Optional[str] = None,
) -> list[ApprovalEvent]:
    """Scan an inclusive block range for ERC-20 Approvals, chunked to fit the RPC."""
    found: list[ApprovalEvent] = []
    for start, end in block_chunks(from_block, to_block):
        logs = rpc.get_logs(start, end, topics=[config.APPROVAL_TOPIC0], address=token)
        found.extend(decode_approvals(logs))
    return found


# ---------------------------------------------------------------------------
# Cursor persistence
# ---------------------------------------------------------------------------


def load_cursor() -> Optional[int]:
    """Last fully-scanned block, or None on a fresh install."""
    path = config.DETECT_CURSOR_PATH
    if not path.is_file():
        return None
    try:
        return int(json.loads(path.read_text())["last_scanned_block"])
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        return None


def save_cursor(block_number: int) -> None:
    config.STATE_DIR.mkdir(parents=True, exist_ok=True)
    config.DETECT_CURSOR_PATH.write_text(
        json.dumps({"last_scanned_block": block_number, "updated_at": time.time()}, indent=2)
    )


# ---------------------------------------------------------------------------
# Live polling
# ---------------------------------------------------------------------------


def follow(
    rpc: JsonRpc,
    start_block: Optional[int] = None,
    token: Optional[str] = None,
    unlimited_only: bool = True,
    on_event=None,
    max_iterations: Optional[int] = None,
) -> None:
    """Poll forward from the cursor, reporting matching approvals as they land.

    Stays `CONFIRMATIONS` blocks behind head so a reorg cannot strand the cursor
    ahead of the canonical chain. `max_iterations` exists so the live proof run
    can be bounded instead of running forever.
    """
    cursor = start_block if start_block is not None else load_cursor()
    if cursor is None:
        cursor = rpc.block_number() - config.CONFIRMATIONS
        emit(f"[detect] no cursor, starting at head-{config.CONFIRMATIONS}: block {cursor}")

    iterations = 0
    while max_iterations is None or iterations < max_iterations:
        iterations += 1
        head = rpc.block_number()
        safe_head = head - config.CONFIRMATIONS

        if safe_head < cursor:
            time.sleep(config.POLL_INTERVAL_SECONDS)
            continue

        events = scan_range(rpc, cursor, safe_head, token=token)
        if unlimited_only:
            events = filter_unlimited(events)

        for event in events:
            if on_event is not None:
                on_event(event)
            else:
                emit(f"[detect] FLAGGED {event.describe()}")
                emit(f"         {event.explorer_url()}")

        cursor = safe_head + 1
        save_cursor(safe_head)
        time.sleep(config.POLL_INTERVAL_SECONDS)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="DAegis Phase 2 approval detector")
    parser.add_argument("--from-block", type=int, help="inclusive start block")
    parser.add_argument("--to-block", type=int, help="inclusive end block (default: head)")
    parser.add_argument("--last", type=int, help="scan the last N blocks up to head")
    parser.add_argument("--follow", action="store_true", help="poll forward continuously")
    parser.add_argument("--token", help="restrict to one token address")
    parser.add_argument(
        "--all", action="store_true", help="report every approval, not just unlimited ones"
    )
    parser.add_argument("--max-iterations", type=int, help="stop --follow after N polls")
    args = parser.parse_args(argv)

    rpc = JsonRpc()
    chain_id = rpc.chain_id()
    if chain_id != config.XLAYER_TESTNET_CHAIN_ID:
        emit(
            f"[detect] WARNING: connected to chain {chain_id}, "
            f"expected X Layer testnet {config.XLAYER_TESTNET_CHAIN_ID}"
        )

    if args.follow:
        follow(
            rpc,
            start_block=args.from_block,
            token=args.token,
            unlimited_only=not args.all,
            max_iterations=args.max_iterations,
        )
        return 0

    head = rpc.block_number()
    to_block = args.to_block if args.to_block is not None else head
    if args.last is not None:
        from_block = to_block - args.last
    elif args.from_block is not None:
        from_block = args.from_block
    else:
        parser.error("give one of --from-block, --last or --follow")

    emit(
        f"[detect] chain {chain_id} | head {head} | scanning {from_block}..{to_block} "
        f"({to_block - from_block + 1} blocks, "
        f"{len(list(block_chunks(from_block, to_block)))} getLogs calls)"
    )

    events = scan_range(rpc, from_block, to_block, token=args.token)
    reported = events if args.all else filter_unlimited(events)

    emit(f"[detect] {len(events)} ERC-20 approvals decoded, {len(reported)} reported")
    for event in reported:
        marker = "FLAGGED" if event.is_unlimited else "seen"
        emit(f"[detect] {marker} {event.describe()}")
        if event.is_unlimited:
            emit(f"         {event.explorer_url()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
