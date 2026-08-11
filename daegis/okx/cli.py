"""Subprocess wrapper around the OKX `onchainos` CLI.

This is the ONLY place DAegis shells out to `onchainos`. Per RESEARCH.md section 2c and
the Path-B decision, the CLI runs inside a `proot-distro` Ubuntu chroot on the Termux
dev machine (glibc binary on bionic host) and runs NATIVELY on the demo VPS (glibc).
The wrapper is proot-agnostic so the same code path works in both environments — callers
never know which launch path was used.

Fail-safe principle (matches onchainos's own): a scan that fails to complete is NOT a
pass. Errors raise OnchainosError; callers must surface them, not swallow.

Zero external dependencies — stdlib only (json, subprocess, dataclasses, unittest for tests).
"""
from __future__ import annotations

import json
import os
import shlex
import subprocess
from dataclasses import dataclass, field
from typing import Any, Optional


class OnchainosError(RuntimeError):
    """Raised when the onchainos CLI fails to complete a call (non-zero exit, JSON
    parse failure, or an explicit `{"ok": false}` payload). NOT a pass — surface to
    the caller, do not swallow."""


# ---------------------------------------------------------------------------
# Response models (stdlib dataclasses — no pydantic)
# ---------------------------------------------------------------------------

_MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935"


@dataclass
class Approval:
    """One entry in the `security approvals` dataList.

    Field names mirror the live onchainos v4.4.9 response (verified 2026-08-10 from
    vitalik@ethereum on mainnet). Notes:
      - `approval_address` is the SPENDER (who was approved), NOT the token. Caller
        must not confuse it with `token_address`.
      - `remain_amount` is the raw decimal allowance as a string. UNLIMITED approvals
        come back as max-uint256, NOT the literal "unlimited". Use `is_unlimited()`.
      - `approval_type` is "approval" for plain ERC-20 approve(); "permit2" / others
        may appear for Permit2 authorizations.
      - `vulnerability_flag` is OKX's own per-approval risk signal (true == flagged).
      - `ext` is a NESTED JSON STRING (double-encoded) — use `ext_dict()` to read it.
    """
    # Required fields (no defaults) — must all come before optional fields
    address: str
    approval_address: str
    approval_type: str
    block_time: int  # ms epoch
    chain_index: int
    network: str
    protocol_name: str
    remain_amount: str
    status: str
    symbol: str
    token_address: str
    # Optional fields (with defaults) — must all come after required fields
    protocol_icon: Optional[str] = None
    remain_amt_precise: Optional[str] = None
    tags: Optional[list[str]] = None
    vulnerability_flag: bool = False
    ext: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Approval:
        """Construct from the raw JSON dict. Uses camelCase keys from the CLI."""
        def _get(key: str, default: Any = None) -> Any:
            return d.get(key, default)

        return cls(
            address=_get("address", ""),
            approval_address=_get("approvalAddress", ""),
            approval_type=_get("approvalType", ""),
            block_time=int(_get("blockTime", 0)),
            chain_index=int(_get("chainIndex", 0)),
            network=_get("network", ""),
            protocol_name=_get("protocolName", ""),
            protocol_icon=_get("protocolIcon"),
            remain_amount=_get("remainAmount", "0"),
            remain_amt_precise=_get("remainAmtPrecise"),
            status=str(_get("status", "")),
            symbol=_get("symbol", ""),
            token_address=_get("tokenAddress", ""),
            tags=_get("tags"),
            vulnerability_flag=bool(_get("vulnerabilityFlag", False)),
            ext=_get("ext"),
        )

    def is_unlimited(self) -> bool:
        """True iff allowance is type(uint256).max."""
        return self.remain_amount == _MAX_UINT256

    def ext_dict(self) -> dict:
        """Decode the nested JSON `ext` string (protocolName, logoUrl, etc)."""
        if not self.ext:
            return {}
        try:
            v = json.loads(self.ext)
            return v if isinstance(v, dict) else {}
        except json.JSONDecodeError:
            return {}



@dataclass
class ApprovalsResult:
    """Parsed `security approvals` response."""
    approvals: list[Approval] = field(default_factory=list)
    cursor: Optional[str] = None  # None when exhausted (CLI returns cursor=0)
    total: int = 0


# ---------------------------------------------------------------------------
# Launch strategy (proot-agnostic)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class _LaunchStrategy:
    """How to invoke onchainos. Determined once at process start by detect_launch()."""
    prefix: tuple[str, ...]  # argv prefix; empty = native
    binary_path: str


def _host_runs_termux() -> bool:
    return os.path.isdir("/data/data/com.termux/files/usr")


def detect_launch() -> _LaunchStrategy:
    """Pick the launch strategy for this host.

    - Termux dev: `proot-distro login ubuntu -- bash -lc` + absolute binary path.
    - Demo VPS / CI: `onchainos` on PATH (native glibc).

    Overrides:
      DAEGIS_ONCHAINOS_BIN=<path>  — use this binary natively
      DAEGIS_PROOT_DISTRO=0     — force native even on Termux
    """
    if os.environ.get("DAEGIS_PROOT_DISTRO", "").lower() in ("0", "false", "no"):
        return _LaunchStrategy(
            prefix=(),
            binary_path=os.environ.get("DAEGIS_ONCHAINOS_BIN", "onchainos"),
        )

    explicit_bin = os.environ.get("DAEGIS_ONCHAINOS_BIN")
    if explicit_bin:
        return _LaunchStrategy(prefix=(), binary_path=explicit_bin)

    if _host_runs_termux():
        return _LaunchStrategy(
            prefix=("proot-distro", "login", "ubuntu", "--", "bash", "-lc"),
            binary_path="/root/.local/bin/onchainos",
        )

    return _LaunchStrategy(prefix=(), binary_path="onchainos")



# ---------------------------------------------------------------------------
# The wrapper
# ---------------------------------------------------------------------------

_ONCHAINOS_TIMEOUT_S = 60


def _run_raw(strategy: _LaunchStrategy, args: list[str], *, timeout: int = _ONCHAINOS_TIMEOUT_S) -> str:
    """Invoke onchainos with `args` and return stdout. Raise OnchainosError on failure."""
    if strategy.prefix:
        cmd_str = shlex.quote(strategy.binary_path) + " " + " ".join(shlex.quote(a) for a in args)
        full = list(strategy.prefix) + [cmd_str]
    else:
        full = [strategy.binary_path, *args]

    try:
        proc = subprocess.run(full, capture_output=True, text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as e:
        raise OnchainosError(f"onchainos timed out after {timeout}s: args={args!r}") from e
    except FileNotFoundError as e:
        raise OnchainosError(
            f"onchainos not found (prefix={strategy.prefix!r}, binary={strategy.binary_path!r}). "
            f"Set DAEGIS_ONCHAINOS_BIN or confirm proot-distro setup."
        ) from e

    if proc.returncode != 0:
        stderr_tail = (proc.stderr or "").strip().splitlines()[-5:]
        raise OnchainosError(
            f"onchainos exited {proc.returncode}: args={args!r} stderr_tail={stderr_tail!r}"
        )

    return proc.stdout


def _parse_json_payload(stdout: str, *, context: str) -> Any:
    s = stdout.strip()
    if not s:
        raise OnchainosError(f"onchainos returned empty stdout ({context})")
    try:
        return json.loads(s)
    except json.JSONDecodeError as e:
        peek = s[:200].replace("\n", "\\n")
        raise OnchainosError(f"onchainos returned non-JSON ({context}): {peek!r}") from e


def _check_ok(payload: Any, *, context: str) -> None:
    if isinstance(payload, dict) and payload.get("ok") is False:
        err = payload.get("error", "<no error field>")
        raise OnchainosError(f"onchainos API error ({context}): {err!r}")


def _parse_approvals_payload(payload: dict) -> ApprovalsResult:
    """Parse the verified live shape into ApprovalsResult.

    Verified shape (2026-08-10, onchainos v4.4.9):
      {"ok": true, "data": [{"cursor": 0, "dataList": [...], "total": N}]}
    data is a LIST; each element has cursor (int; 0 == no next page), dataList, total.
    """
    data_list = payload.get("data", [])
    if not isinstance(data_list, list):
        raise OnchainosError(f"approvals 'data' is not a list: got {type(data_list).__name__}")

    all_items: list[dict[str, Any]] = []
    next_cursor: Optional[str] = None
    total = 0
    for page in data_list:
        if not isinstance(page, dict):
            continue
        items = page.get("dataList", [])
        if isinstance(items, list):
            all_items.extend(it for it in items if isinstance(it, dict))
        c = page.get("cursor", 0)
        if isinstance(c, int) and c != 0:
            next_cursor = str(c)
        t = page.get("total")
        if isinstance(t, int):
            total = t

    try:
        approvals = [Approval.from_dict(it) for it in all_items]
    except (KeyError, TypeError, ValueError) as e:
        raise OnchainosError(f"approvals schema validation failed: {e}") from e

    return ApprovalsResult(approvals=approvals, cursor=next_cursor, total=total)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_approvals(
    address: str,
    *,
    chain: str,
    limit: int = 20,
    cursor: Optional[str] = None,
    strategy: Optional[_LaunchStrategy] = None,
) -> ApprovalsResult:
    """Call `onchainos security approvals` and return a parsed ApprovalsResult.

    Args:
        address: EVM wallet address (0x...). Caller validates format.
        chain: comma-separated chain names or IDs, e.g. "xlayer_test" or "196".
        limit: page size (1..200). Default 20.
        cursor: pagination cursor from a previous result, or None for first page.
        strategy: optional injected launch strategy (used by tests).

    Raises:
        OnchainosError: on any non-complete outcome.
    """
    s = strategy or detect_launch()
    args = ["security", "approvals", "--address", address, "--chain", chain, "--limit", str(limit)]
    if cursor:
        args += ["--cursor", cursor]

    raw = _run_raw(s, args)
    payload = _parse_json_payload(raw, context="approvals")
    _check_ok(payload, context="approvals")
    return _parse_approvals_payload(payload)


def version(strategy: Optional[_LaunchStrategy] = None) -> str:
    """Return onchainos --version output (first non-empty line). For smoke tests."""
    s = strategy or detect_launch()
    out = _run_raw(s, ["--version"])
    for line in out.strip().splitlines():
        if line.strip():
            return line.strip()
    return out.strip()
