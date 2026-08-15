"""Unit tests for agent.decide pure functions — no network.

Usage:
  cd ~/daegis-agent
  python3 -m unittest agent.tests.test_decide -v

Per CLAUDE.md the decision path is proven against LIVE testnet (the Phase 3 gate:
drainer -> malicious, router -> benign). These cover the pure, deterministic pieces
that the live gate sits on top of. Where possible they run on REAL captured data:
`extract_selectors` runs against the two spenders' real on-chain bytecode
(fixtures/real_spender_bytecode.json), and `third_party_drain` uses the exact
addresses from the real planted drain. The LLM call itself is not unit-tested (it
is non-deterministic and lives behind the network); `_parse_verdict` is tested
against the shapes a model actually returns.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from agent import config
from agent.decide import (
    DecideError,
    TokenMovement,
    _parse_verdict,
    extract_selectors,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _bytecode() -> dict:
    return json.loads((FIXTURES / "real_spender_bytecode.json").read_text())


# ---------------------------------------------------------------------------
# extract_selectors — against REAL on-chain bytecode
# ---------------------------------------------------------------------------

# Known selectors (from `cast sig`) for the two spenders' functions.
CLAIM = "0x21c0b342"          # claim(address,address)
ATTACKER = "0x48eb76ee"       # attacker()
SWAP = "0xd004f0f7"           # swap(address,uint256)
TRANSFER_FROM = "0x23b872dd"  # transferFrom(address,address,uint256)
BALANCE_OF = "0x70a08231"     # balanceOf(address)


class TestExtractSelectorsRealBytecode(unittest.TestCase):
    """The exposed/called split is the lead evidence; it must recover the right
    ABI from real bytecode with no source."""

    def setUp(self):
        self.fx = _bytecode()

    def _code(self, which: str) -> bytes:
        return bytes.fromhex(self.fx[which]["code"][2:])

    def test_drainer_exposes_claim_and_attacker(self):
        exposed, called = extract_selectors(self._code("drainer"))
        self.assertEqual(set(exposed), {CLAIM, ATTACKER})

    def test_drainer_calls_balanceof_and_transferfrom(self):
        exposed, called = extract_selectors(self._code("drainer"))
        self.assertEqual(set(called), {BALANCE_OF, TRANSFER_FROM})

    def test_router_exposes_only_swap(self):
        exposed, called = extract_selectors(self._code("router"))
        self.assertEqual(set(exposed), {SWAP})

    def test_router_calls_only_transferfrom(self):
        exposed, called = extract_selectors(self._code("router"))
        self.assertEqual(set(called), {TRANSFER_FROM})

    def test_attacker_getter_is_exposed_not_called(self):
        # The attacker() getter is the standalone drainer tell — it must land in
        # exposed (the ABI), not be misread as a selector the contract calls out.
        exposed, called = extract_selectors(self._code("drainer"))
        self.assertIn(ATTACKER, exposed)
        self.assertNotIn(ATTACKER, called)

    def test_transferfrom_is_called_not_exposed_for_both(self):
        for which in ("drainer", "router"):
            exposed, called = extract_selectors(self._code(which))
            self.assertIn(TRANSFER_FROM, called, which)
            self.assertNotIn(TRANSFER_FROM, exposed, which)

    def test_selectors_are_deduped(self):
        # transferFrom appears twice in each contract's bytecode; the split must
        # list it once.
        exposed, called = extract_selectors(self._code("drainer"))
        self.assertEqual(len(called), len(set(called)))
        self.assertEqual(len(exposed), len(set(exposed)))

    def test_empty_bytecode_yields_nothing(self):
        self.assertEqual(extract_selectors(b""), ([], []))

    def test_push_immediates_not_misread_as_opcodes(self):
        # A PUSH32 whose data happens to contain 0x63 (PUSH4) bytes must not be
        # walked into and mis-parsed. 0x7f = PUSH32, followed by 32 data bytes
        # that include 0x63; the next real opcode is STOP.
        code = bytes([0x7F]) + bytes([0x63]) * 32 + bytes([0x00])
        exposed, called = extract_selectors(code)
        self.assertEqual((exposed, called), ([], []))


# ---------------------------------------------------------------------------
# TokenMovement.third_party_drain — the dispositive discriminator
# ---------------------------------------------------------------------------

# Real addresses from the planted drain / router history.
VICTIM = "0x7283b95fd7ced1189b0751108f466f19ef4d1da3"   # owner
ATTACKER_ADDR = "0x00000000000000000000000000000000a77ac000"  # external beneficiary
EOA1 = "0x7dc5480452d70277316179d57956c7fe72f37a5f"     # third-party initiator
ROUTER = "0x122589df6fc8bf65500927dbcb87906bba715ed0"
TOKEN = "0x28ef702c621dd0b82ae5bb0753c3a3c1d875a20e"


def _movement(owner, to, sender) -> TokenMovement:
    return TokenMovement(owner=owner, to=to, sender=sender, token=TOKEN, block_number=1)


class TestThirdPartyDrain(unittest.TestCase):
    """This flag is what separates malicious from benign — the whole verdict
    turns on it, so pin every case."""

    def test_real_drain_is_flagged(self):
        # The actual planted drain: victim's tokens -> attacker, sent by EOA-1.
        m = _movement(owner=VICTIM, to=ATTACKER_ADDR, sender=EOA1)
        self.assertTrue(m.third_party_drain)

    def test_owner_initiated_deposit_into_spender_is_not_a_drain(self):
        # The real benign router move: owner sends own tokens into the router.
        m = _movement(owner=VICTIM, to=ROUTER, sender=VICTIM)
        self.assertFalse(m.third_party_drain)

    def test_owner_moving_own_tokens_to_third_party_is_not_flagged(self):
        # Owner is the sender, so even to a third party it is the owner's own
        # decision — not a drain by someone else.
        m = _movement(owner=VICTIM, to=ATTACKER_ADDR, sender=VICTIM)
        self.assertFalse(m.third_party_drain)

    def test_third_party_returning_tokens_to_owner_is_not_flagged(self):
        # Non-owner sender, but tokens go back to the owner — not a drain.
        m = _movement(owner=VICTIM, to=VICTIM, sender=EOA1)
        self.assertFalse(m.third_party_drain)

    def test_flag_needs_both_nonowner_recipient_and_nonowner_sender(self):
        # Only when BOTH the recipient and the sender differ from the owner is it
        # a third-party drain.
        self.assertTrue(_movement(VICTIM, ATTACKER_ADDR, EOA1).third_party_drain)
        self.assertFalse(_movement(VICTIM, VICTIM, EOA1).third_party_drain)
        self.assertFalse(_movement(VICTIM, ATTACKER_ADDR, VICTIM).third_party_drain)

    def test_case_insensitive(self):
        m = _movement(owner=VICTIM.upper(), to=ATTACKER_ADDR.upper(), sender=EOA1.upper())
        self.assertTrue(m.third_party_drain)


# ---------------------------------------------------------------------------
# _parse_verdict — defensive JSON extraction for an on-chain write
# ---------------------------------------------------------------------------

SPENDER = "0xe9eb89da7a2df4bd1a644d737baeff1dde87f7d5"


def _reply(verdict="malicious", score=99, reasoning="cites attacker() getter") -> str:
    return json.dumps(
        {"spender": SPENDER, "risk_score": score, "verdict": verdict, "reasoning": reasoning}
    )


class TestParseVerdict(unittest.TestCase):
    def test_bare_json(self):
        v = _parse_verdict(_reply(), SPENDER)
        self.assertEqual(v.verdict, "malicious")
        self.assertEqual(v.risk_score, 99)
        self.assertEqual(v.spender, SPENDER)

    def test_markdown_fenced_json(self):
        v = _parse_verdict("```json\n" + _reply(verdict="benign", score=15) + "\n```", SPENDER)
        self.assertEqual(v.verdict, "benign")
        self.assertEqual(v.risk_score, 15)

    def test_json_with_surrounding_prose(self):
        text = "Here is my verdict:\n" + _reply(verdict="suspicious", score=50) + "\nHope this helps."
        v = _parse_verdict(text, SPENDER)
        self.assertEqual(v.verdict, "suspicious")

    def test_verdict_is_lowercased(self):
        v = _parse_verdict(_reply(verdict="MALICIOUS"), SPENDER)
        self.assertEqual(v.verdict, "malicious")

    def test_risk_score_clamped_to_max(self):
        v = _parse_verdict(_reply(score=250), SPENDER)
        self.assertEqual(v.risk_score, config.MAX_RISK_SCORE)

    def test_negative_risk_score_clamped_to_zero(self):
        v = _parse_verdict(_reply(score=-5), SPENDER)
        self.assertEqual(v.risk_score, 0)

    def test_unknown_verdict_raises(self):
        with self.assertRaises(DecideError):
            _parse_verdict(_reply(verdict="dangerous"), SPENDER)

    def test_empty_reasoning_raises(self):
        # The reasoning is what gets hash-pinned on-chain; an empty one is useless.
        with self.assertRaises(DecideError):
            _parse_verdict(_reply(reasoning=""), SPENDER)

    def test_non_integer_score_raises(self):
        with self.assertRaises(DecideError):
            _parse_verdict(
                json.dumps({"spender": SPENDER, "risk_score": "high", "verdict": "malicious", "reasoning": "x"}),
                SPENDER,
            )

    def test_no_json_object_raises(self):
        with self.assertRaises(DecideError):
            _parse_verdict("I cannot produce a verdict.", SPENDER)

    def test_malformed_json_raises(self):
        with self.assertRaises(DecideError):
            _parse_verdict('{"verdict": "malicious", "risk_score": 99,,,}', SPENDER)

    def test_spender_comes_from_evidence_not_model(self):
        # The spender field is set from the address we scanned, never from the
        # model's echo — so a model that hallucinates a different address in its
        # JSON cannot redirect the on-chain write.
        wrong = json.dumps(
            {"spender": "0x" + "b" * 40, "risk_score": 99, "verdict": "malicious", "reasoning": "x"}
        )
        v = _parse_verdict(wrong, SPENDER)
        self.assertEqual(v.spender, SPENDER)


if __name__ == "__main__":
    unittest.main()
