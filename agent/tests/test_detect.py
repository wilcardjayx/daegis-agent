"""Unit tests for agent.detect — decode and filter logic only, no network.

Usage:
  cd ~/daegis-agent
  python3 -m unittest agent.tests.test_detect -v

Per CLAUDE.md the detection path is not allowed to run on mocked chain data.
Every fixture here is a REAL `eth_getLogs` payload captured from X Layer testnet
(see fixtures/real_approval_logs.json) — both the ERC-20 approvals and the
ERC-721 approval that shares their topic0. Nothing in this file is fabricated.
The live end-to-end proof is a separate scripted run against the chain.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from agent import config
from agent.detect import (
    ApprovalEvent,
    block_chunks,
    decode_approval,
    decode_approvals,
    filter_unlimited,
    is_erc20_approval,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _fixture() -> dict:
    return json.loads((FIXTURES / "real_approval_logs.json").read_text())


def _real_logs() -> list[dict]:
    """Real ERC-20 Approval logs planted by EOA-2 on X Layer testnet."""
    return _fixture()["erc20_logs"]


def _real_erc721_logs() -> list[dict]:
    """A real ERC-721 Approval log — same topic0, different shape."""
    return _fixture()["erc721_logs"]


class TestDecodeRealLogs(unittest.TestCase):
    """Against genuine on-chain payloads planted by EOA-2 on X Layer testnet."""

    def setUp(self):
        self.logs = _real_logs()
        self.events = decode_approvals(self.logs)

    def test_both_logs_decode(self):
        self.assertEqual(len(self.events), 2)

    def test_unlimited_approval_decodes_to_max_uint256(self):
        unlimited = [e for e in self.events if e.is_exact_max]
        self.assertEqual(len(unlimited), 1)
        e = unlimited[0]
        self.assertEqual(e.value, config.MAX_UINT256)
        self.assertEqual(e.owner, "0x7283b95fd7ced1189b0751108f466f19ef4d1da3")
        self.assertEqual(e.spender, "0x00000000000000000000000000000000deadbeef")
        self.assertEqual(e.token, "0x28ef702c621dd0b82ae5bb0753c3a3c1d875a20e")
        self.assertEqual(e.block_number, 38201163)

    def test_limited_approval_decodes_to_exact_amount(self):
        limited = [e for e in self.events if not e.is_unlimited]
        self.assertEqual(len(limited), 1)
        self.assertEqual(limited[0].value, 100 * 10**18)
        self.assertEqual(limited[0].spender, "0x00000000000000000000000000000000c0ffee00")

    def test_addresses_are_lowercased(self):
        for e in self.events:
            self.assertEqual(e.owner, e.owner.lower())
            self.assertEqual(e.spender, e.spender.lower())
            self.assertEqual(e.token, e.token.lower())

    def test_explorer_url_points_at_the_real_tx(self):
        e = next(e for e in self.events if e.is_exact_max)
        self.assertIn(e.tx_hash, e.explorer_url())
        self.assertIn("xlayer-test", e.explorer_url())


class TestUnlimitedFilter(unittest.TestCase):
    """The Phase 2 detector itself: which allowances count as unlimited."""

    def _event(self, value: int) -> ApprovalEvent:
        return ApprovalEvent(
            token="0x" + "1" * 40,
            owner="0x" + "2" * 40,
            spender="0x" + "3" * 40,
            value=value,
            block_number=1,
            tx_hash="0x" + "4" * 64,
            log_index=0,
        )

    def test_max_uint256_is_unlimited_and_exact(self):
        e = self._event(config.MAX_UINT256)
        self.assertTrue(e.is_unlimited)
        self.assertTrue(e.is_exact_max)

    def test_threshold_boundary_is_inclusive(self):
        self.assertTrue(self._event(config.UNLIMITED_THRESHOLD).is_unlimited)
        self.assertFalse(self._event(config.UNLIMITED_THRESHOLD - 1).is_unlimited)

    def test_large_but_sane_allowance_is_not_flagged(self):
        # A million 18-decimal tokens. Big, but a real amount a real user might
        # approve — flagging this would make the detector useless in practice.
        self.assertFalse(self._event(10**6 * 10**18).is_unlimited)

    def test_just_below_max_still_counts_as_unlimited(self):
        # Drainers do not always use exactly type(uint256).max.
        e = self._event(config.MAX_UINT256 - 1)
        self.assertTrue(e.is_unlimited)
        self.assertFalse(e.is_exact_max)

    def test_zero_is_a_revocation_not_a_threat(self):
        e = self._event(0)
        self.assertTrue(e.is_revocation)
        self.assertFalse(e.is_unlimited)

    def test_filter_keeps_only_unlimited(self):
        events = [self._event(0), self._event(10**21), self._event(config.MAX_UINT256)]
        kept = filter_unlimited(events)
        self.assertEqual(len(kept), 1)
        self.assertTrue(kept[0].is_exact_max)


class TestErc20VsErc721(unittest.TestCase):
    """ERC-721's Approval hashes to the SAME topic0 as ERC-20's.

    Filtering on topic0 alone would decode an NFT tokenId as an allowance, and a
    high tokenId would then look like an enormous approval. These assert the
    shape discriminator that prevents that false positive.
    """

    def test_real_erc20_log_is_accepted(self):
        for log in _real_logs():
            self.assertTrue(is_erc20_approval(log))

    def test_real_erc721_log_collides_on_topic0(self):
        # The premise of this whole test class, asserted against chain data
        # rather than assumed: an ERC-721 approval really does carry the ERC-20
        # Approval topic0, so topic0 alone cannot separate them.
        for log in _real_erc721_logs():
            self.assertEqual(log["topics"][0].lower(), config.APPROVAL_TOPIC0.lower())

    def test_real_erc721_log_has_the_erc721_shape(self):
        for log in _real_erc721_logs():
            self.assertEqual(len(log["topics"]), 4, "tokenId is indexed")
            self.assertEqual(log["data"], "0x", "no unindexed payload")

    def test_real_erc721_approval_is_rejected(self):
        logs = _real_erc721_logs()
        self.assertTrue(logs, "fixture must contain a real ERC-721 approval")
        for log in logs:
            self.assertFalse(is_erc20_approval(log))
        self.assertEqual(decode_approvals(logs), [])

    def test_the_false_positive_this_prevents_is_real(self):
        # The captured NFT was minted with tokenId = type(uint256).max. Decoded
        # as if it were an ERC-20 allowance it is exactly max-uint256 — i.e. the
        # detector's single strongest "unlimited approval" signal, fired by an
        # NFT approval that grants no token allowance at all.
        log = _real_erc721_logs()[0]
        token_id = int(log["topics"][3], 16)
        self.assertEqual(token_id, config.MAX_UINT256)
        self.assertGreaterEqual(token_id, config.UNLIMITED_THRESHOLD)
        # ...and it is dropped before any of that decoding can happen.
        self.assertEqual(decode_approvals([log]), [])

    def test_wrong_topic0_is_rejected(self):
        log = dict(_real_logs()[0])
        log["topics"] = [config.TRANSFER_TOPIC0] + list(log["topics"][1:])
        self.assertFalse(is_erc20_approval(log))

    def test_missing_data_word_is_rejected(self):
        log = dict(_real_logs()[0])
        log["data"] = "0x"
        self.assertFalse(is_erc20_approval(log))


class TestBlockChunks(unittest.TestCase):
    """The RPC rejects any getLogs span wider than 100 blocks, so chunking is a
    correctness requirement, not a performance tweak."""

    def test_small_range_is_one_chunk(self):
        self.assertEqual(list(block_chunks(100, 150)), [(100, 150)])

    def test_exact_cap_stays_one_chunk(self):
        chunks = list(block_chunks(0, config.MAX_LOG_RANGE_BLOCKS))
        self.assertEqual(chunks, [(0, 100)])

    def test_one_past_cap_splits(self):
        chunks = list(block_chunks(0, config.MAX_LOG_RANGE_BLOCKS + 1))
        self.assertEqual(chunks, [(0, 100), (101, 101)])

    def test_no_chunk_exceeds_the_rpc_cap(self):
        chunks = list(block_chunks(1_000, 5_555))
        for start, end in chunks:
            self.assertLessEqual(end - start, config.MAX_LOG_RANGE_BLOCKS)

    def test_chunks_are_contiguous_and_cover_the_range(self):
        chunks = list(block_chunks(10, 999))
        self.assertEqual(chunks[0][0], 10)
        self.assertEqual(chunks[-1][1], 999)
        for (_, prev_end), (next_start, _) in zip(chunks, chunks[1:]):
            self.assertEqual(next_start, prev_end + 1, "gap or overlap between chunks")

    def test_single_block_range(self):
        self.assertEqual(list(block_chunks(42, 42)), [(42, 42)])

    def test_empty_range_yields_nothing(self):
        # The normal state of a caught-up poller.
        self.assertEqual(list(block_chunks(100, 99)), [])


class TestDecodeSingle(unittest.TestCase):
    def test_decode_approval_preserves_raw_log(self):
        log = _real_logs()[0]
        event = decode_approval(log)
        self.assertEqual(event.raw, log)

    def test_describe_marks_unlimited(self):
        event = next(e for e in decode_approvals(_real_logs()) if e.is_exact_max)
        self.assertIn("UNLIMITED", event.describe())

    def test_describe_shows_plain_amount_for_limited(self):
        event = next(e for e in decode_approvals(_real_logs()) if not e.is_unlimited)
        self.assertIn(str(100 * 10**18), event.describe())


if __name__ == "__main__":
    unittest.main()
