"""Unit tests for agent.act branch dispatch — mocked cast, no network, no chain.

Usage:
  cd ~/daegis-agent
  python3 -m unittest agent.tests.test_act -v

The full act path is proven live in the Phase 4 run (malicious -> record+revoke,
suspicious -> record only, benign -> nothing, all unattended on testnet). These
pin the branch LOGIC deterministically: which on-chain calls fire for each verdict
and guarded/non-guarded owner combination. `cast` is mocked at the _cast_send /
keccak_text seam so no transaction is ever sent.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from agent import act, config
from agent.decide import Verdict
from agent.detect import ApprovalEvent

GUARDED = "0x273650d9001f1c7dd6ba098c22cba045743c9ddf"  # a whitelisted guarded account
STRANGER = "0x7283b95fd7ced1189b0751108f466f19ef4d1da3"  # a plain EOA, not guarded
TOKEN = "0x28ef702c621dd0b82ae5bb0753c3a3c1d875a20e"
SPENDER = "0xe9eb89da7a2df4bd1a644d737baeff1dde87f7d5"
REGISTRY = "0x7f9c1eb88cb6cc7d098a3ba1ade13b57761b48d9"
FAKE_HASH = "0x" + "ab" * 32


def _event(owner: str) -> ApprovalEvent:
    return ApprovalEvent(
        token=TOKEN, owner=owner, spender=SPENDER, value=2**256 - 1,
        block_number=100, tx_hash="0x" + "cd" * 32, log_index=0,
    )


def _verdict(kind: str, score: int) -> Verdict:
    return Verdict(spender=SPENDER, risk_score=score, verdict=kind, reasoning=f"{kind} because reasons")


class ActDispatchTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)

        # Mock the on-chain seam and keccak; isolate config from the real .env.
        self.cast_send = patch.object(act, "_cast_send", side_effect=self._fake_send).start()
        patch.object(act, "keccak_text", return_value=FAKE_HASH).start()
        patch.object(config, "GUARDED_ACCOUNTS", frozenset({GUARDED})).start()
        patch.object(config, "VERDICT_STORE_DIR", Path(self._tmp.name)).start()
        patch.object(config, "THREAT_REGISTRY_ADDRESS", REGISTRY).start()
        patch.object(config, "env", side_effect=lambda k, d="": "0xdeadbeefkey" if k == "DEPLOYER_PRIVATE_KEY" else d).start()
        self.addCleanup(patch.stopall)

        self._tx_counter = 0

    def _fake_send(self, to, signature, args, private_key):
        self._tx_counter += 1
        return f"0x{'0' * 63}{self._tx_counter}"

    # -- helpers to read what was sent --

    def _signatures_sent(self) -> list[str]:
        return [call.args[1] for call in self.cast_send.call_args_list]

    def _reason_files(self) -> list[Path]:
        return list(Path(self._tmp.name).glob("*.json"))

    # -- malicious --

    def test_malicious_guarded_records_and_revokes(self):
        result = act.act_on_verdict(_verdict("malicious", 95), _event(GUARDED))
        self.assertTrue(result.recorded)
        self.assertTrue(result.revoked)
        self.assertEqual(
            self._signatures_sent(),
            ["record(address,uint8,bytes32)", "revoke(address,address)"],
        )
        # revoke goes to the guarded account with (token, spender)
        revoke_call = self.cast_send.call_args_list[1]
        self.assertEqual(revoke_call.args[0], GUARDED)
        self.assertEqual(revoke_call.args[2], [TOKEN, SPENDER])

    def test_malicious_nonguarded_records_but_does_not_revoke(self):
        result = act.act_on_verdict(_verdict("malicious", 95), _event(STRANGER))
        self.assertTrue(result.recorded)
        self.assertFalse(result.revoked)
        self.assertEqual(self._signatures_sent(), ["record(address,uint8,bytes32)"])
        self.assertIsNone(result.revoke_tx)

    def test_malicious_record_carries_score_and_reasonhash(self):
        act.act_on_verdict(_verdict("malicious", 95), _event(GUARDED))
        record_call = self.cast_send.call_args_list[0]
        self.assertEqual(record_call.args[0], REGISTRY)
        # args to record(): [spender, risk_score, reasonHash]
        self.assertEqual(record_call.args[2], [SPENDER, "95", FAKE_HASH])

    # -- suspicious --

    def test_suspicious_guarded_records_only(self):
        result = act.act_on_verdict(_verdict("suspicious", 50), _event(GUARDED))
        self.assertTrue(result.recorded)
        self.assertFalse(result.revoked)
        # Even though the owner IS guarded, suspicious never revokes.
        self.assertEqual(self._signatures_sent(), ["record(address,uint8,bytes32)"])

    def test_suspicious_nonguarded_records_only(self):
        result = act.act_on_verdict(_verdict("suspicious", 50), _event(STRANGER))
        self.assertTrue(result.recorded)
        self.assertFalse(result.revoked)
        self.assertEqual(self._signatures_sent(), ["record(address,uint8,bytes32)"])

    # -- benign --

    def test_benign_does_nothing(self):
        result = act.act_on_verdict(_verdict("benign", 15), _event(GUARDED))
        self.assertFalse(result.recorded)
        self.assertFalse(result.revoked)
        self.assertEqual(self.cast_send.call_count, 0)  # no cast send at all
        self.assertIsNone(result.record_tx)
        self.assertIsNone(result.reason_hash)

    # -- reasoning store --

    def test_reasoning_stored_for_recorded_verdicts(self):
        act.act_on_verdict(_verdict("malicious", 95), _event(GUARDED))
        files = self._reason_files()
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0].name, f"{FAKE_HASH}.json")

    def test_reasoning_not_stored_for_benign(self):
        act.act_on_verdict(_verdict("benign", 15), _event(GUARDED))
        self.assertEqual(self._reason_files(), [])

    # -- guarded-set matching is case-insensitive --

    def test_guarded_match_is_case_insensitive(self):
        # The event owner arrives checksummed; the whitelist is lowercased.
        result = act.act_on_verdict(_verdict("malicious", 95), _event(GUARDED.upper()))
        self.assertTrue(result.revoked)


if __name__ == "__main__":
    unittest.main()
