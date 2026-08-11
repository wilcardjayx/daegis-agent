# DAegis Agent

**An autonomous security agent on X Layer that detects dangerous token approvals in real time and revokes them onchain before they're exploited.**

> 🏆 Built for the **OKX Build-X Hackathon — AI Season (Aug 7–21, 2026)**

---

## What it does

DAegis has two jobs:

1. **Live threat feed** — watches X Layer transactions and contracts in real time, flagging risky patterns: malicious approvals, drainer bytecode, honeypot contracts, and flash-loan attack shapes.
2. **Auto-revoke wallet guard** — using OKX's TEE-secured Agentic Wallet, DAegis autonomously revokes dangerous approvals before they can be exploited. Not just alerts — actual onchain action.

## Stack

- **X Layer** (OKX's OP Stack L2, chain ID 196) — fully EVM-equivalent
- **OKX OnchainOS** `onchainos` CLI — token/tx/approval security scanning + TEE-secured Agentic Wallet execution
- **Python** + web3.py — live block/mempool watcher against X Layer RPC

## Status

🚧 Early development — built during the hackathon window. See issues/commits for progress.

## License

MIT
