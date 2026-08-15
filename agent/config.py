"""Chain, RPC and contract configuration for the DAegis agent.

Every chain-level constant lives here. Nothing downstream of this module is
allowed to inline a chain ID, an RPC URL, a contract address or an event topic —
per CLAUDE.md, guessed values of exactly that kind are the main way this project
goes sideways.

Values are sourced in this order:
  1. process environment
  2. the repo-root `.env` (gitignored; holds testnet throwaway keys)
  3. the checked-in defaults below, which are the values confirmed in CLAUDE.md

Zero external dependencies — stdlib only, matching okx_client.py. There is no
python-dotenv here on purpose; `_load_env_file` is nine lines and saves a
dependency on a 4 GB phone.
"""
from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = REPO_ROOT / ".env"


def _load_env_file(path: Path = ENV_PATH) -> dict[str, str]:
    """Parse a minimal KEY=VALUE .env. Ignores blanks, comments and junk lines."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


_ENV_FILE = _load_env_file()


def env(name: str, default: str = "") -> str:
    """Real environment wins over .env, which wins over the passed default."""
    return os.environ.get(name) or _ENV_FILE.get(name) or default


# ---------------------------------------------------------------------------
# Chain facts — confirmed from official OKX docs, see CLAUDE.md "Chain facts"
# ---------------------------------------------------------------------------

XLAYER_TESTNET_CHAIN_ID = 1952  # NOT 195; that is a deprecated older testnet
XLAYER_MAINNET_CHAIN_ID = 196

XLAYER_TESTNET_RPC = env("XLAYER_TESTNET_RPC_URL", "https://testrpc.xlayer.tech/terigon")
XLAYER_TESTNET_RPC_BACKUP = "https://xlayertestrpc.okx.com/terigon"
XLAYER_MAINNET_RPC = env("XLAYER_MAINNET_RPC_URL", "https://rpc.xlayer.tech")
XLAYER_MAINNET_RPC_BACKUP = "https://xlayerrpc.okx.com"

EXPLORER_TX_URL = "https://www.okx.com/web3/explorer/xlayer-test/tx/{tx_hash}"
EXPLORER_ADDRESS_URL = "https://www.okx.com/web3/explorer/xlayer-test/address/{address}"

# Gas token is OKB, not ETH. Kept as a name so log lines can't drift.
GAS_TOKEN_SYMBOL = "OKB"

# ---------------------------------------------------------------------------
# RPC limits — MEASURED against testrpc.xlayer.tech/terigon on Aug 13 2026.
# These are not guesses and not documented by OKX; re-probe if the RPC changes.
# ---------------------------------------------------------------------------

#: `eth_getLogs` rejects any request where toBlock - fromBlock > 100 with
#: `-32602 block range greater than 100 max`. A span of exactly 100 succeeds.
MAX_LOG_RANGE_BLOCKS = 100

#: Measured 1.0 s/block over a 100-block sample. The poller must therefore keep
#: up with ~100 blocks per 100 seconds; one full-size getLogs window per second
#: is the break-even rate.
BLOCK_TIME_SECONDS = 1.0

#: How far behind head to stay. X Layer is an OP Stack chain with 1 s blocks;
#: a small lag avoids re-reading logs that a reorg would invalidate.
CONFIRMATIONS = 2

#: Sleep between polls when caught up. Below block time is pointless.
POLL_INTERVAL_SECONDS = 2.0

RPC_TIMEOUT_SECONDS = 20
RPC_MAX_ATTEMPTS = 3

# ---------------------------------------------------------------------------
# Event signatures — computed with `cast keccak`, not typed from memory
# ---------------------------------------------------------------------------

#: keccak256("Approval(address,address,uint256)")
#: WARNING: ERC-721's `Approval(address,address,uint256)` hashes identically.
#: The two are distinguished by shape, not by topic — see detect.is_erc20_approval.
APPROVAL_TOPIC0 = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"

#: keccak256("Transfer(address,address,uint256)")
TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

# ---------------------------------------------------------------------------
# Allowance thresholds
# ---------------------------------------------------------------------------

MAX_UINT256 = 2**256 - 1

#: What counts as "unlimited" for the Phase 2 detector.
#:
#: Not every drainer uses exactly type(uint256).max — some use max/2, or a
#: number with enough zeros that it exceeds any real token's supply while
#: looking less obviously hostile in a wallet UI. Anything at or above 2**255
#: is unspendable-in-practice for any real token, so it is treated as
#: effectively unlimited. Exact max is still reported distinctly, because it is
#: the single strongest signal and the LLM in Phase 3 should see the difference.
UNLIMITED_THRESHOLD = 2**255

# ---------------------------------------------------------------------------
# Deployed contracts (Phase 1) and demo props
# ---------------------------------------------------------------------------

THREAT_REGISTRY_ADDRESS = env("THREAT_REGISTRY_ADDRESS")
GUARDED_ACCOUNT_ADDRESS = env("GUARDED_ACCOUNT_ADDRESS")
DEMO_TOKEN_ADDRESS = env("DEMO_TOKEN_ADDRESS")
DEMO_SPENDER_ADDRESS = env("DEMO_SPENDER_ADDRESS")

DEPLOYER_ADDRESS = env("DEPLOYER_ADDRESS")
DEMO_OWNER_ADDRESS = env("DEMO_OWNER_ADDRESS")
TEE_WALLET_ADDRESS = env("TEE_WALLET_ADDRESS")

#: Where the poller remembers how far it has scanned. Gitignored.
STATE_DIR = REPO_ROOT / "agent" / "state"
DETECT_CURSOR_PATH = STATE_DIR / "detect_cursor.json"

# ---------------------------------------------------------------------------
# Phase 3 — LLM verdict (decide.py)
# ---------------------------------------------------------------------------

#: Model the verdict runs on. Chosen by the user for Phase 3. Exact ID, no date
#: suffix. Called over raw HTTPS with stdlib urllib (see decide.py) rather than
#: the anthropic SDK — the SDK pulls in a Rust-extension dependency whose aarch64
#: wheel is unreliable on the 4 GB phone this builds on.
LLM_MODEL = "claude-sonnet-4-6"
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_API_VERSION = "2023-06-01"
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY")

#: Verdict output is deliberately tiny: strict JSON with 1-3 sentence reasoning.
#: The reasoning is hash-pinned on-chain, so it must be short and evidence-citing,
#: not an essay. This caps a runaway generation, not the expected length.
LLM_MAX_TOKENS = 512

#: The three verdict labels decide.py will accept back from the model.
VERDICTS = ("malicious", "suspicious", "benign")

#: Risk scores are 0-100. Mirrors ThreatRegistry.MAX_RISK_SCORE on-chain, which
#: rejects anything higher — decide.py clamps to this before any registry write.
MAX_RISK_SCORE = 100

# ---------------------------------------------------------------------------
# Phase 4 — act (registry write + guarded revoke)
# ---------------------------------------------------------------------------

#: How far back the live loop looks when gathering a flagged spender's evidence:
#: window is [approval_block - this, current safe head]. Small enough to stay
#: within a couple of getLogs chunks (the RPC's 100-block cap) so a verdict is
#: fast, large enough to catch recent history around the approval.
EVIDENCE_LOOKBACK_BLOCKS = 200

#: Addresses the agent is allowed to AUTO-REVOKE for. Per SPEC.md's hard scope
#: rule, auto-revoke is restricted to this whitelist of guarded demo wallets —
#: never arbitrary wallets. Currently just the deployed GuardedAccount.
GUARDED_ACCOUNTS = frozenset(a for a in (GUARDED_ACCOUNT_ADDRESS.lower(),) if a)

#: Full LLM reasoning is stored here, one file per verdict, keyed by the keccak256
#: reasonHash that is pinned on-chain. Phase 6's public page resolves the on-chain
#: hash back to prose through this store. Gitignored (under STATE_DIR).
VERDICT_STORE_DIR = STATE_DIR / "verdicts"

#: The `cast` binary (Foundry). Used for LOCAL, keyless operations only —
#: `cast keccak` (reasonHash) and `cast calldata` (encode a call). Foundry is
#: already the project's tooling everywhere, and this avoids a native-secp256k1
#: Python dependency that is unreliable on aarch64.
CAST_BIN = env("DAEGIS_CAST_BIN") or str(Path.home() / ".foundry" / "bin" / "cast")

# ---------------------------------------------------------------------------
# Phase 5 — TEE agentic wallet as the on-chain identity
# ---------------------------------------------------------------------------

#: After the Phase 5 rotation the TEE agentic wallet is BOTH the ThreatRegistry
#: agent (record) and the GuardedAccount guardian (revoke). The loop therefore
#: holds no private key for these writes — the key lives in OKX's TEE and the
#: writes go through `onchainos wallet contract-call`, which signs there. Calldata
#: is still built locally and keylessly with `cast calldata`.
ONCHAINOS_BIN = env("DAEGIS_ONCHAINOS_BIN") or str(Path.home() / ".local" / "bin" / "onchainos")

#: The `onchainos --chain` value for X Layer testnet. Confirmed from
#: `onchainos wallet chains`: chainName "xlayer_test" maps to chainIndex 1952.
#: NOT the numeric id — the CLI wants the chainName here.
XLAYER_TESTNET_CHAIN_NAME = "xlayer_test"
