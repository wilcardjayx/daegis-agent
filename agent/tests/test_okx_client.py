"""Unit tests for agent.okx_client — run against fixtures, no live network.

Usage:
  cd ~/daegis-agent
  python3 -m unittest agent.tests.test_okx_client -v

The live integration test is in test_live_approvals.py (skipped unless
DAEGIS_LIVE_OKX=1 is set, because it requires the chroot + authenticated wallet).
"""
from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from agent.okx_client import (
    Approval,
    ApprovalsResult,
    OnchainosError,
    _LaunchStrategy,
    _check_ok,
    _parse_approvals_payload,
    _parse_json_payload,
    detect_launch,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _load_json(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


# ---------------------------------------------------------------------------
# _parse_json_payload
# ---------------------------------------------------------------------------

class TestParseJsonPayload(unittest.TestCase):
    def test_valid_json(self):
        out = _parse_json_payload('{"ok": true}', context="t")
        self.assertEqual(out, {"ok": True})

    def test_empty_raises(self):
        with self.assertRaises(OnchainosError, msg="empty stdout"):
            _parse_json_payload("   ", context="t")

    def test_non_json_raises(self):
        with self.assertRaises(OnchainosError, msg="non-JSON"):
            _parse_json_payload("not json at all", context="t")


# ---------------------------------------------------------------------------
# _check_ok
# ---------------------------------------------------------------------------

class TestCheckOk(unittest.TestCase):
    def test_ok_true_passes(self):
        _check_ok({"ok": True, "data": []}, context="t")  # no raise

    def test_ok_false_raises(self):
        with self.assertRaises(OnchainosError, msg="API error"):
            _check_ok({"ok": False, "error": "Invalid Authority"}, context="t")

    def test_missing_ok_field_passes(self):
        _check_ok({"data": []}, context="t")  # no raise


# ---------------------------------------------------------------------------
# Approval model
# ---------------------------------------------------------------------------

class TestApproval(unittest.TestCase):
    def setUp(self):
        self.vitalik = _load_json("sample_approvals.json")
        self.raw_moodeng = self.vitalik["data"][0]["dataList"][0]

    def test_from_dict_live_shape(self):
        a = Approval.from_dict(self.raw_moodeng)
        self.assertEqual(a.approval_address, "0xc92e8bdf79f0507f65a392b0ab4667716bfe0110")
        self.assertEqual(a.token_address, "0x28561b8a2360f463011c16b6cc0b0cbef8dbbcad")
        self.assertEqual(a.symbol, "MOODENG")
        self.assertEqual(a.protocol_name, "cowswap")
        self.assertEqual(a.chain_index, 1)
        self.assertEqual(a.block_time, 1728272207000)
        self.assertEqual(a.approval_type, "approval")
        self.assertFalse(a.vulnerability_flag)
        # Large remain_amount but NOT exactly max-uint256
        self.assertFalse(a.is_unlimited())

    def test_ext_dict(self):
        a = Approval.from_dict(self.raw_moodeng)
        ext = a.ext_dict()
        self.assertEqual(ext["protocolName"], "MOO DENG")
        self.assertIn("logoUrl", ext)

    def test_is_unlimited_false_for_finite(self):
        raw = {
            "address": "0x" + "0" * 39 + "1",
            "approvalAddress": "0x" + "0" * 39 + "2",
            "approvalType": "approval",
            "blockTime": 1,
            "chainIndex": 196,
            "network": "XLayer",
            "protocolName": "test",
            "remainAmount": "1000000000000000000",
            "status": "1",
            "symbol": "TST",
            "tokenAddress": "0x" + "0" * 39 + "3",
        }
        a = Approval.from_dict(raw)
        self.assertFalse(a.is_unlimited())

    def test_ext_dict_returns_empty_on_missing(self):
        raw = {
            "address": "0x" + "0" * 39 + "1",
            "approvalAddress": "0x" + "0" * 39 + "2",
            "approvalType": "approval",
            "blockTime": 1, "chainIndex": 196, "network": "XLayer",
            "protocolName": "test", "remainAmount": "0", "status": "1",
            "symbol": "TST", "tokenAddress": "0x" + "0" * 39 + "3",
        }
        a = Approval.from_dict(raw)
        self.assertEqual(a.ext_dict(), {})


# ---------------------------------------------------------------------------
# _parse_approvals_payload
# ---------------------------------------------------------------------------

class TestParseApprovalsPayload(unittest.TestCase):
    def test_empty_response(self):
        payload = {"ok": True, "data": [{"cursor": 0, "dataList": [], "total": 0}]}
        res = _parse_approvals_payload(payload)
        self.assertEqual(res.approvals, [])
        self.assertIsNone(res.cursor)
        self.assertEqual(res.total, 0)

    def test_populated_response(self):
        payload = _load_json("sample_approvals.json")
        res = _parse_approvals_payload(payload)
        self.assertEqual(len(res.approvals), 3)
        self.assertEqual(res.cursor, "4503717")
        self.assertEqual(res.total, 2197)
        # BITE and USDT are max-uint256; MOODENG is large but not exact max
        unlimited_symbols = {a.symbol for a in res.approvals if a.is_unlimited()}
        self.assertEqual(unlimited_symbols, {"BITE", "USDT"})
        self.assertEqual({a.symbol for a in res.approvals}, {"MOODENG", "BITE", "USDT"})
        # Two cowswap approvals share the same spender
        cowswap_spenders = {a.approval_address for a in res.approvals if a.protocol_name == "cowswap"}
        self.assertEqual(cowswap_spenders, {"0xc92e8bdf79f0507f65a392b0ab4667716bfe0110"})

    def test_non_list_data_raises(self):
        with self.assertRaises(OnchainosError, msg="not a list"):
            _parse_approvals_payload({"ok": True, "data": "bad"})


# ---------------------------------------------------------------------------
# Launch-strategy detection
# ---------------------------------------------------------------------------

class TestDetectLaunch(unittest.TestCase):
    def test_force_native_via_env(self):
        with patch.dict(os.environ, {"DAEGIS_PROOT_DISTRO": "0"}, clear=False):
            s = detect_launch()
            self.assertEqual(s.prefix, ())

    def test_explicit_bin_via_env(self):
        with patch.dict(os.environ, {"DAEGIS_ONCHAINOS_BIN": "/usr/local/bin/onchainos"}, clear=False):
            s = detect_launch()
            self.assertEqual(s.prefix, ())
            self.assertEqual(s.binary_path, "/usr/local/bin/onchainos")

    def test_termux_selects_proot(self):
        with patch.dict(os.environ, {"DAEGIS_PROOT_DISTRO": "", "DAEGIS_ONCHAINOS_BIN": ""}, clear=False):
            s = detect_launch()
            if os.path.isdir("/data/data/com.termux/files/usr"):
                self.assertEqual(s.prefix, ("proot-distro", "login", "ubuntu", "--", "bash", "-lc"))
                self.assertEqual(s.binary_path, "/root/.local/bin/onchainos")
            else:
                self.assertEqual(s.prefix, ())

    def test_frozen_dataclass(self):
        s = _LaunchStrategy(prefix=(), binary_path="onchainos")
        with self.assertRaises(AttributeError):
            s.prefix = ("x",)  # frozen=True


if __name__ == "__main__":
    unittest.main()