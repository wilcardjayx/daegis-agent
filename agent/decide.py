"""Phase 3 — the decide half of the loop: an LLM verdict on a spender contract.

This is the part a rule cannot do (SPEC.md "Why an LLM"). The unlimited-allowance
heuristic in detect.py flags a spender; decide.py judges *intent* and must clear
the false positives the heuristic cannot — a legitimate DEX router holds unlimited
approvals from thousands of users and is perfectly safe.

Evidence handed to the model, in priority order (agreed design):
  1. Decoded function selectors from `eth_getCode`, split into EXPOSED (the ABI
     the contract presents) and CALLED (selectors it builds calldata for). These
     lead because they reveal intent: a hard-coded `attacker()` beneficiary or a
     `claim(address,address)` that pulls from an arbitrary victim is a drainer
     tell that a router never shows.
  2. Verified-source status.
  3. Recent approval + transfer logs, with a third-party-drain flag raised when an
     owner's tokens moved to a non-owner in a transaction the owner did not send.
  4. Raw bytecode — fallback field only, never the primary signal.

Selectors and logs are reasoned over TOGETHER on purpose. Selectors reveal that a
contract *can* call `transferFrom` (both the drainer and a real router do); only
the logs show whether it has actually moved an owner's funds to a third party.
Neither channel alone is sufficient.

Stdlib only — `urllib` over the Messages API, matching okx_client.py / detect.py.
No SDK. See config.LLM_MODEL for why.
"""
from __future__ import annotations

import argparse
import json
import ssl
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Optional

from agent import config
from agent.detect import JsonRpc, emit


class DecideError(RuntimeError):
    """The verdict could not be produced (LLM call failed, or the model returned
    something that is not a valid verdict). Never silently downgraded to a benign
    verdict — an un-scored spender is unknown, not safe."""


# ---------------------------------------------------------------------------
# Selector decoding
# ---------------------------------------------------------------------------

#: selector -> human signature. A real deployment would fall back to a 4-byte
#: directory for anything not here; an unresolved selector is itself a signal and
#: is shown raw to the model rather than hidden.
KNOWN_SELECTORS = {
    "0x21c0b342": "claim(address,address)",
    "0x48eb76ee": "attacker()",
    "0xd004f0f7": "swap(address,uint256)",
    "0x23b872dd": "transferFrom(address,address,uint256)",
    "0x70a08231": "balanceOf(address)",
    "0x095ea7b3": "approve(address,uint256)",
    "0xa9059cbb": "transfer(address,uint256)",
    "0xdd62ed3e": "allowance(address,address)",
    "0x18160ddd": "totalSupply()",
    "0x40c10f19": "mint(address,uint256)",
    "0x8da5cb5b": "owner()",
    "0xf2fde38b": "transferOwnership(address)",
    "0x42842e0e": "safeTransferFrom(address,address,uint256)",
}


def decode_selector(selector: str) -> str:
    return KNOWN_SELECTORS.get(selector, f"{selector} (unresolved)")


def extract_selectors(code: bytes) -> tuple[list[str], list[str]]:
    """Split a contract's PUSH4 selector immediates into (exposed, called).

    A PUSH4 whose immediate is followed by an `EQ` (0x14) within a few bytes is a
    dispatcher comparison — a function the contract EXPOSES. A PUSH4 that is
    instead shifted/stored to build calldata is a selector the contract CALLS on
    some other contract. Validated against the Phase 3 spenders, whose ABIs are
    known: it recovers exactly claim/attacker (exposed) + balanceOf/transferFrom
    (called) for the drainer, and swap (exposed) + transferFrom (called) for the
    router.
    """
    exposed: list[str] = []
    called: list[str] = []
    seen_exposed: set[str] = set()
    seen_called: set[str] = set()
    i = 0
    while i < len(code):
        op = code[i]
        if op == 0x63 and i + 5 <= len(code):  # PUSH4
            selector = "0x" + code[i + 1 : i + 5].hex()
            window = code[i + 5 : i + 8]
            if 0x14 in window:  # EQ close after -> dispatcher compare
                if selector not in seen_exposed:
                    seen_exposed.add(selector)
                    exposed.append(selector)
            else:
                if selector not in seen_called:
                    seen_called.add(selector)
                    called.append(selector)
            i += 5
            continue
        if 0x60 <= op <= 0x7f:  # skip other PUSHn immediates
            i += 1 + (op - 0x5F)
            continue
        i += 1
    return exposed, called


# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------


def _pad_topic(address: str) -> str:
    return "0x" + "0" * 24 + address.lower().replace("0x", "")


def _addr_from_topic(topic: str) -> str:
    return "0x" + topic[-40:]


@dataclass
class ApprovalGrant:
    owner: str
    token: str
    allowance: int
    block_number: int

    @property
    def is_unlimited(self) -> bool:
        return self.allowance >= config.UNLIMITED_THRESHOLD


@dataclass
class TokenMovement:
    owner: str  # the `from` of the Transfer — whose tokens moved
    to: str
    sender: str  # the EOA/contract that sent the transaction
    token: str
    block_number: int

    @property
    def third_party_drain(self) -> bool:
        """Owner's tokens moved to a non-owner, in a tx the owner did not send."""
        o = self.owner.lower()
        return self.to.lower() != o and self.sender.lower() != o


@dataclass
class Evidence:
    spender: str
    exposed_selectors: list[str]
    called_selectors: list[str]
    source_verified: Optional[bool]  # None == unknown
    approvals: list[ApprovalGrant] = field(default_factory=list)
    movements: list[TokenMovement] = field(default_factory=list)
    bytecode_hex: str = ""

    def render(self) -> str:
        """Format the evidence for the model. Selectors first, bytecode last."""
        lines: list[str] = [f"SPENDER: {self.spender}", ""]

        lines.append("EXPOSED FUNCTIONS (the ABI this contract presents):")
        lines += [f"  - {decode_selector(s)}" for s in self.exposed_selectors] or ["  (none decoded)"]
        lines.append("")
        lines.append("CALLED SELECTORS (functions it invokes on other contracts):")
        lines += [f"  - {decode_selector(s)}" for s in self.called_selectors] or ["  (none decoded)"]
        lines.append("")

        if self.source_verified is None:
            src = "unknown"
        else:
            src = "verified" if self.source_verified else "UNVERIFIED (no public source)"
        lines.append(f"SOURCE: {src}")
        lines.append("")

        lines.append("APPROVALS GRANTING THIS SPENDER (recent):")
        if self.approvals:
            for a in self.approvals:
                amt = "UNLIMITED" if a.is_unlimited else str(a.allowance)
                lines.append(
                    f"  - owner {a.owner} approved {amt} of token {a.token} (block {a.block_number})"
                )
        else:
            lines.append("  (none observed)")
        lines.append("")

        lines.append("TOKEN MOVEMENTS INVOLVING THOSE OWNERS:")
        if self.movements:
            spender = self.spender.lower()
            for m in self.movements:
                owner_is_sender = m.sender.lower() == m.owner.lower()
                if m.third_party_drain:
                    lines.append(
                        f"  - THIRD-PARTY DRAIN: owner {m.owner}'s tokens moved to {m.to} "
                        f"(neither the owner nor this spender) in a tx SENT BY {m.sender} "
                        f"(NOT the owner), token {m.token}, block {m.block_number}"
                    )
                elif owner_is_sender and m.to.lower() == spender:
                    lines.append(
                        f"  - self-initiated deposit: owner {m.owner} sent their OWN tokens "
                        f"INTO this spender (to == spender) in a tx they sent themselves, "
                        f"token {m.token}, block {m.block_number}"
                    )
                elif owner_is_sender:
                    lines.append(
                        f"  - self-initiated: owner {m.owner} moved their own tokens to "
                        f"{m.to} in a tx they sent themselves, token {m.token}, block {m.block_number}"
                    )
                else:
                    lines.append(
                        f"  - owner {m.owner}'s tokens moved to {m.to}, "
                        f"tx sent by {m.sender}, token {m.token}, block {m.block_number}"
                    )
        else:
            lines.append("  (none observed)")
        lines.append("")

        preview = self.bytecode_hex[:80] + ("…" if len(self.bytecode_hex) > 80 else "")
        lines.append(f"RAW BYTECODE (fallback only): {preview}")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Evidence gathering (live chain)
# ---------------------------------------------------------------------------


def _get_code(rpc: JsonRpc, address: str) -> bytes:
    result = rpc.call("eth_getCode", [address, "latest"])
    return bytes.fromhex((result or "0x")[2:])


def _tx_sender(rpc: JsonRpc, tx_hash: str) -> str:
    tx = rpc.call("eth_getTransactionByHash", [tx_hash])
    return (tx or {}).get("from", "")


def _scan(rpc: JsonRpc, from_block: int, to_block: int, topics: list[Any], address: Optional[str] = None):
    from agent.detect import block_chunks

    out: list[dict[str, Any]] = []
    for start, end in block_chunks(from_block, to_block):
        out.extend(rpc.get_logs(start, end, topics=topics, address=address))
    return out


def gather_evidence(
    rpc: JsonRpc,
    spender: str,
    from_block: int,
    to_block: int,
    source_verified: Optional[bool],
) -> Evidence:
    """Assemble on-chain evidence for one spender over an explicit block range.

    The range is passed in rather than discovered: detect.py already owns live
    scanning, and pinning the window keeps the verdict reproducible.
    """
    code = _get_code(rpc, spender)
    exposed, called = extract_selectors(code)

    approvals: list[ApprovalGrant] = []
    for log in _scan(
        rpc, from_block, to_block, topics=[config.APPROVAL_TOPIC0, None, _pad_topic(spender)]
    ):
        topics = log.get("topics") or []
        if len(topics) != 3:  # ERC-20 shape only (see CLAUDE.md topic0 collision note)
            continue
        approvals.append(
            ApprovalGrant(
                owner=_addr_from_topic(topics[1]).lower(),
                token=log["address"].lower(),
                allowance=int(log["data"][:66], 16),
                block_number=int(log["blockNumber"], 16),
            )
        )

    movements: list[TokenMovement] = []
    for grant in approvals:
        for log in _scan(
            rpc,
            from_block,
            to_block,
            topics=[config.TRANSFER_TOPIC0, _pad_topic(grant.owner)],
            address=grant.token,
        ):
            topics = log.get("topics") or []
            if len(topics) != 3:
                continue
            movements.append(
                TokenMovement(
                    owner=grant.owner,
                    to=_addr_from_topic(topics[2]).lower(),
                    sender=_tx_sender(rpc, log["transactionHash"]).lower(),
                    token=grant.token,
                    block_number=int(log["blockNumber"], 16),
                )
            )

    return Evidence(
        spender=spender.lower(),
        exposed_selectors=exposed,
        called_selectors=called,
        source_verified=source_verified,
        approvals=approvals,
        movements=movements,
        bytecode_hex="0x" + code.hex(),
    )


# ---------------------------------------------------------------------------
# The verdict prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are DAegis, an onchain security analyst. You judge whether a smart contract \
that has been granted a token approval (a "spender") is safe, given evidence \
gathered from its bytecode and its onchain history.

Your reasoning is written into a public onchain registry, so it must cite the \
specific evidence it rests on and be short.

THE KEY DISCRIMINATOR — read it from the transfer LOGS, not from function-argument \
shapes: who moved an owner's approved tokens, and where did they go?
- If a NON-OWNER moved an owner's tokens, or an owner's tokens went to an address \
that is neither the owner nor this spender (an external beneficiary), that is a \
DRAIN. Malicious.
- If EVERY observed movement of an owner's tokens was initiated BY THAT OWNER and \
went into this spender itself (or back to the owner), the approval is being used \
exactly as a legitimate router/protocol approval is meant to be. Benign. This holds \
no matter how many distinct owners appear — independent owners each interacting with \
the contract only on their own behalf is the signature of a shared, legitimate \
protocol, not a drainer.

Do NOT infer malice from the number or type of a function's arguments. \
`swap(address,uint256)` and `claim(address,address)` both take an address argument, \
but the argument alone tells you nothing — only the LOGS reveal whether that address \
is ever used to victimize a third party. Never call a plain function signature a \
"drainer tell" on its own; judge on observed transfers.

Supporting signals (they adjust the score within a verdict, they do not set it):
- A hard-coded beneficiary getter such as attacker() is a genuine structural drainer \
tell — a legitimate protocol has no reason to expose one. Weight it heavily.
- An UNLIMITED allowance is NOT a red flag. Legitimate routers require unlimited \
approvals. Never raise the verdict on allowance size alone.
- Unverified source or a small/unfamiliar ABI only nudges the score WITHIN a band. \
Neither is, on its own, grounds for 'suspicious'. Clean observed history (all \
movements owner-initiated, no third-party drain, no beneficiary getter) CLEARS the \
unverified-source prior — do not hold unverified source against a contract whose \
actual behaviour is clean.

Verdict labels:
- malicious: a drain is observed in the logs (non-owner moved an owner's tokens, or \
tokens went to an external beneficiary), OR a hard-coded beneficiary getter is present.
- suspicious: a concrete structural concern the history has neither confirmed nor \
cleared (e.g. approvals exist but NO movements have been observed yet, so intent is \
untested). Not for unverified-source or unfamiliar-ABI alone.
- benign: every observed movement is owner-initiated into the spender or back to the \
owner, no third-party drain, no beneficiary getter — the approval is legitimately used.

Output STRICT JSON and nothing else — no markdown, no code fences, no prose before \
or after. Exactly these keys:
{"spender": "<address>", "risk_score": <integer 0-100>, "verdict": \
"malicious"|"suspicious"|"benign", "reasoning": "<1 to 3 sentences citing specific \
evidence: selector names, addresses, or block numbers>"}
risk_score must agree with the verdict: benign 0-33, suspicious 34-66, malicious 67-100."""


def build_user_message(evidence: Evidence) -> str:
    return (
        "Evaluate this spender and return the strict JSON verdict.\n\n"
        + evidence.render()
    )


# ---------------------------------------------------------------------------
# The LLM call
# ---------------------------------------------------------------------------


@dataclass
class Verdict:
    spender: str
    risk_score: int
    verdict: str
    reasoning: str
    raw: dict[str, Any] = field(default_factory=dict, repr=False, compare=False)


def _call_anthropic(system: str, user: str) -> str:
    if not config.ANTHROPIC_API_KEY:
        raise DecideError("ANTHROPIC_API_KEY is not set (check .env)")

    body = json.dumps(
        {
            "model": config.LLM_MODEL,
            "max_tokens": config.LLM_MAX_TOKENS,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
    ).encode()

    req = urllib.request.Request(
        config.ANTHROPIC_API_URL,
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": config.ANTHROPIC_API_KEY,
            "anthropic-version": config.ANTHROPIC_API_VERSION,
        },
    )

    # Retry transport-level failures. The dev network is a phone on mobile data;
    # transient TLS corruption (SSLV3_ALERT_BAD_RECORD_MAC) and dropped
    # connections are common and recover on a retry. Note ssl.SSLError is NOT
    # always wrapped in URLError — it can surface raw — so it is caught by name.
    _RETRYABLE_HTTP = {408, 429, 500, 502, 503, 504, 529}
    last_error: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    for attempt in range(config.RPC_MAX_ATTEMPTS):
        try:
            with urllib.request.urlopen(req, timeout=config.RPC_TIMEOUT_SECONDS) as resp:
                payload = json.loads(resp.read().decode())
            break
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:300]
            if e.code in _RETRYABLE_HTTP:
                last_error = f"HTTP {e.code}: {detail}"
                time.sleep(0.5 * (attempt + 1))
                continue
            # 400/401/403 etc. are our bug, not a blip — fail immediately.
            raise DecideError(f"Anthropic HTTP {e.code}: {detail}") from e
        except (ssl.SSLError, urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as e:
            last_error = f"{type(e).__name__}: {e}"
            time.sleep(0.5 * (attempt + 1))
            continue

    if payload is None:
        raise DecideError(f"Anthropic call failed after {config.RPC_MAX_ATTEMPTS} attempts: {last_error}")

    if payload.get("stop_reason") == "refusal":
        raise DecideError("model refused to answer")

    return "".join(b.get("text", "") for b in payload.get("content", []) if b.get("type") == "text")


def _parse_verdict(text: str, spender: str) -> Verdict:
    """Pull the strict JSON verdict out of the model's reply, defensively.

    The model is asked for bare JSON, but strip code fences and locate the object
    anyway rather than trusting formatting for an on-chain write.
    """
    s = text.strip()
    if s.startswith("```"):
        s = s.strip("`")
        if s[:4].lower() == "json":
            s = s[4:]
    start, end = s.find("{"), s.rfind("}")
    if start == -1 or end == -1:
        raise DecideError(f"no JSON object in model reply: {text[:200]!r}")
    try:
        obj = json.loads(s[start : end + 1])
    except json.JSONDecodeError as e:
        raise DecideError(f"model reply was not valid JSON: {e}") from e

    verdict = str(obj.get("verdict", "")).lower()
    if verdict not in config.VERDICTS:
        raise DecideError(f"model returned an unknown verdict: {verdict!r}")
    try:
        score = int(obj["risk_score"])
    except (KeyError, TypeError, ValueError) as e:
        raise DecideError(f"model returned a non-integer risk_score: {e}") from e
    score = max(0, min(config.MAX_RISK_SCORE, score))

    reasoning = str(obj.get("reasoning", "")).strip()
    if not reasoning:
        raise DecideError("model returned an empty reasoning")

    return Verdict(spender=spender.lower(), risk_score=score, verdict=verdict, reasoning=reasoning, raw=obj)


def decide(evidence: Evidence) -> Verdict:
    text = _call_anthropic(SYSTEM_PROMPT, build_user_message(evidence))
    return _parse_verdict(text, evidence.spender)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="DAegis Phase 3 LLM verdict")
    parser.add_argument("--spender", required=True, help="spender contract address")
    parser.add_argument("--from-block", type=int, required=True)
    parser.add_argument("--to-block", type=int, required=True)
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--verified", dest="verified", action="store_true", help="source is verified")
    src.add_argument("--unverified", dest="verified", action="store_false", help="source is unverified")
    parser.set_defaults(verified=None)
    parser.add_argument("--show-evidence", action="store_true", help="print the evidence block too")
    args = parser.parse_args(argv)

    rpc = JsonRpc()
    evidence = gather_evidence(rpc, args.spender, args.from_block, args.to_block, args.verified)
    if args.show_evidence:
        emit(evidence.render())
        emit("")

    verdict = decide(evidence)
    emit(json.dumps(
        {
            "spender": verdict.spender,
            "risk_score": verdict.risk_score,
            "verdict": verdict.verdict,
            "reasoning": verdict.reasoning,
        },
        indent=2,
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
