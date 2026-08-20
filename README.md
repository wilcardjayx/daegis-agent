# DAegis

Most wallet security tools tell you about a threat after you have already signed for it. A token approval you granted months ago is a standing permission: the spender can move that token out of your wallet at any time, with no further signature from you. Drainers live in that gap. They wait for an approval, then pull the balance when it suits them.

DAegis closes the gap. It is an autonomous agent that watches X Layer for dangerous approvals, reasons about whether the spender is actually hostile, and for wallets that opt in, revokes the approval on-chain before anything moves. The verdicts are written to a public registry that any wallet or dApp can read for free.

Built for the OKX Build-X Hackathon, AI Season.

For the full build journal, every obstacle and how it got solved, see [BUILD_NOTES.md](BUILD_NOTES.md).

---

## The result, first

On X Layer testnet, a malicious contract received an unlimited token approval from a guarded account. DAegis caught it and set the allowance back to zero before a single token moved.

| Event | Block | Transaction |
|---|---|---|
| Unlimited approval to a flagged spender lands | `38340097` | [`0x8137a8a7...5ad0`](https://www.okx.com/web3/explorer/xlayer-test/tx/0x8137a8a7578ddfa58b3c5c34f97654c20d28ea42e70e2caee4872ef4781d5ad0) |
| Guardian sets the allowance to `0` | `38340188` | [`0xbf96b638...ce2f`](https://www.okx.com/web3/explorer/xlayer-test/tx/0xbf96b638e8dffb62cf6561e1dbd04e4bf7d08c48331ef0d192d807e5ed4ace2f) |

That is a gap of `91` blocks, roughly 91 seconds at X Layer's one-second block time. The verdict recorded `0` observed token movements, so the revoke was pre-emptive: the drain never executed. The spender's allowance on that account still reads `0` on-chain today. Every hash above is a real transaction on the OKX explorer.

The revoke was signed by the OKX TEE Agentic Wallet, not by any private key sitting on the machine that runs the agent. More on that in [Architecture](#architecture).

---

## What it does

DAegis runs one loop, unattended: Detect, Decide, Act.

**Detect.** A poller reads `Approval` logs from X Layer in 100-block chunks and keeps the ones granting an unlimited allowance. Spotting an unlimited allowance is something a regular expression could do, so it is only the trigger here, never the verdict.

**Decide.** For each flagged approval, the agent collects real evidence about the spender: its bytecode decoded into the function selectors it exposes and the ones it calls internally, its recent approval and transfer history, and whether its source is verified. That evidence goes to an LLM, which returns a structured verdict of `malicious`, `suspicious`, or `benign`, a risk score from `0` to `100`, and one to three sentences of reasoning that cite the specific evidence rather than guessing.

**Act.** The verdict is written to a public on-chain registry. If it is `malicious` and the approval's owner is a guarded account, the guardian revokes the approval by setting it to `0`. Benign spenders are not recorded, because the registry is a threat feed and logging legitimate approvals only dilutes the signal.

---

## Why an LLM and not a heuristic

This is the core technical claim, so here is the proof instead of the assertion.

Two spender contracts were deployed on testnet. Each received the same unlimited approval from the same guarded account. A rule keyed on "unlimited allowance" flags both of them identically and learns nothing. DAegis reads each contract's bytecode and reaches opposite, correct verdicts.

**DrainerSpender** [`0xe9eb89da...F7D5`](https://www.okx.com/web3/explorer/xlayer-test/address/0xe9eb89da7a2dF4Bd1A644d737bAEFf1dDE87F7D5) becomes `malicious`, risk `95`, and is revoked.

> The contract exposes an `attacker()` getter, which is a hard-coded structural drainer tell. No legitimate protocol has any reason to publish an endpoint like that. Combined with a `claim(address,address)` that invokes `transferFrom` on approved tokens and an unverified source, the contract is built to drain the owner's unlimited approval. No token movements observed yet, but the `attacker()` getter alone is enough for a malicious verdict.

**RouterSpender** [`0x122589dF...5ED0`](https://www.okx.com/web3/explorer/xlayer-test/address/0x122589dF6fC8BF65500927dbcb87906bbA715ED0) becomes `suspicious`, risk `50`, and is left alone.

> The contract exposes only `swap(address,uint256)` and calls `transferFrom`, which is consistent with a legitimate router but also with a drainer. Unverified source and the absence of any observed transfer history leave the approval's legitimacy unconfirmed.

Same input signal, opposite outcomes. The drainer hard-codes where funds go through `attacker()` and takes an arbitrary victim address in `claim`, so it is drained and revoked. The router only ever pulls from its own caller, `transferFrom(msg.sender, ...)`, and hard-codes no beneficiary, so it is recorded for watching while its approval is left intact, which is exactly how a real DEX router needs to behave. A denylist cannot draw that line. Reasoning over the contract's behavior can.

The full reasoning text lives off-chain, and its `keccak256` hash is pinned on-chain in the registry. That makes the prose tamper-evident: anyone can recompute the hash and confirm the reasoning was not edited after the fact. The public site does exactly this check in the browser.

---

## Live deployment

Both contracts are deployed and source-verified on X Layer mainnet (chain ID `196`) and X Layer testnet (chain ID `1952`). Each was built with `solc 0.8.35`, `evm_version = "paris"`, and the optimizer on at 200 runs.

### Mainnet (chain ID `196`)

| Contract | Address | Deploy tx | Deploy gas |
|---|---|---|---|
| `ThreatRegistry` | [`0x7c4b62d1e48a33a26440f64eb7c696b3986cf1d2`](https://www.okx.com/web3/explorer/xlayer/address/0x7c4b62d1e48a33a26440f64eb7c696b3986cf1d2) | [`0x4db5ad8e...a497`](https://www.okx.com/web3/explorer/xlayer/tx/0x4db5ad8e62b16fb35854d22b221e25cebf25925ca75e2b86f11298f1d8d9a497) | `384,647` |
| `GuardedAccount` | [`0x8d0f7b2c2782d69cdaaef13ac7b32f80a455670a`](https://www.okx.com/web3/explorer/xlayer/address/0x8d0f7b2c2782d69cdaaef13ac7b32f80a455670a) | [`0x0d4916fa...daf9`](https://www.okx.com/web3/explorer/xlayer/tx/0x0d4916fae34d272a39acab9924f39f87f2a441475e274d6ef4d5e2327651daf9) | `532,789` |

### Testnet (chain ID `1952`)

| Contract | Address | Deploy tx | Deploy gas |
|---|---|---|---|
| `ThreatRegistry` | [`0x7f9C1eB88cB6cc7D098a3ba1aDe13b57761b48D9`](https://www.okx.com/web3/explorer/xlayer-test/address/0x7f9C1eB88cB6cc7D098a3ba1aDe13b57761b48D9) | `0x5ec00443...24f3` | `384,647` |
| `GuardedAccount` | [`0x273650d9001F1C7dD6Ba098C22cBA045743c9DDf`](https://www.okx.com/web3/explorer/xlayer-test/address/0x273650d9001F1C7dD6Ba098C22cBA045743c9DDf) | `0x16a1c25e...281a` | `532,789` |

The registry read is public and free. Any wallet or dApp can query any spender with a single `eth_call`, no key and no account required:

```bash
# Mainnet
curl -s https://rpc.xlayer.tech \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{
    "to":"0x7c4b62d1e48a33a26440f64eb7c696b3986cf1d2",
    "data":"0xfef48a99000000000000000000000000<spender_address_here>"
  },"latest"]}'
# returns (bool flagged, uint8 riskScore, bytes32 reasonHash)
```

The testnet registry at `0x7f9C1eB88cB6cc7D098a3ba1aDe13b57761b48D9` holds the proven demo verdicts (the drainer flagged at risk `95`, the router at `50`). Query it the same way against `https://testrpc.xlayer.tech/terigon`.

---

## Architecture

```
                         X Layer (chain 1952 testnet / 196 mainnet)
                                    |
                                    |  eth_getLogs, polled in 100-block chunks
                                    v
        +-----------+       +-----------+       +--------------------------------+
        |  DETECT   | ----> |  DECIDE   | ----> |              ACT               |
        |           |       |           |       |                                |
        | unlimited |       | LLM reads |       |  malicious  -> record + revoke |
        | Approval  |       | bytecode  |       |  suspicious -> record only     |
        | filter    |       | + history |       |  benign     -> nothing         |
        +-----------+       +-----------+       +---------------+----------------+
                                                                |
                                  both on-chain writes are      |
                                  signed inside the TEE, the     v
                                  agent holds no key   +--------------------------+
                                                       |  OKX TEE Agentic Wallet  |
                                                       |  ThreatRegistry.agent    |
                                                       |  + GuardedAccount.guardian|
                                                       +------------+-------------+
                                                                    |
                                              ERC-4337 UserOps       |
                                                                     v
                    +------------------------------+   +------------------------------+
                    |  ThreatRegistry              |   |  GuardedAccount              |
                    |  record(spender, risk, hash) |   |  revoke(token, spender)      |
                    |  isFlagged(spender) [public] |   |  = approve(spender, 0)       |
                    +------------------------------+   +------------------------------+
```

A single identity, the OKX TEE Agentic Wallet (`0x3c7acf83bb12e082e4e86a6eb5479a8d42a7c465`), is both the registry's `agent`, the only address allowed to write verdicts, and the guarded account's `guardian`, the only address allowed to revoke. The rotation onto that wallet is itself on-chain: `setGuardian` in [`0x7e9fd3a8...f264b`](https://www.okx.com/web3/explorer/xlayer-test/tx/0x7e9fd3a804d29fc773565a1c000de164199e52b9f96f6d64350fcef75d8f264b) and `setAgent` in [`0xa20add2e...b7b`](https://www.okx.com/web3/explorer/xlayer-test/tx/0xa20add2e2e8097c3a388c62aa017b0791d3061d26c75cf3078e62ad67cd23b7b).

Because that wallet signs inside OKX's TEE, the agent process holds no private key for any on-chain action. It builds calldata locally, hands it to the `onchainos` CLI, and the TEE produces the ERC-4337 UserOp. One unattended run proves the whole path end to end: a planted approval at block `38355001` was detected, judged `malicious 95`, recorded in [`0xadb53572...dbe93`](https://www.okx.com/web3/explorer/xlayer-test/tx/0xadb5357209902b7f112b5c762b4ca8f6e50916268ca19b1e4ed62d15c41dbe93), and revoked in [`0xc2ab1f78...a452`](https://www.okx.com/web3/explorer/xlayer-test/tx/0xc2ab1f78479ed92a65c2ae77787d2878a1df3c7f00a4888e5ef22d8f9674a452), with no manual step. Both write transactions have the TEE wallet as their sender.

The guardian's authority is deliberately narrow. It can call exactly one state-changing function, `revoke(token, spender)`, which sets an approval to zero. It cannot move tokens, cannot change the owner, and cannot change the guardian, not even to itself. This is not a policy promise, it is the shape of the contract, and a Foundry test fuzzes arbitrary calldata from the guardian and asserts that every call other than `revoke` reverts.

---

## Running this yourself

You do not need to run anything to check the central claim. The contracts are verified on the explorer, and the `eth_call` shown above returns the drainer's live verdict from any machine. If you want the full loop locally, here is the path from a clean checkout.

### 1. Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`).
- Python 3.10 or newer. The agent uses only the standard library, so there is nothing to `pip install`.
- Git.
- Node.js and npm, only if you want to build the frontend.

### 2. Clone the repository

```bash
git clone https://github.com/wilcardjayx/daegis-agent.git
cd daegis-agent
```

### 3. Build and test the contracts

No network is needed for this step.

```bash
cd contracts
forge build
forge test
cd ..
```

### 4. Run the agent's unit tests

These run against captured real chain data, again with no network access.

```bash
python3 -m unittest discover -s agent/tests -p 'test_*.py'
```

### 5. Query the live registry (no keys, no setup)

Run the `curl` command from the [Live deployment](#live-deployment) section against mainnet or testnet, substituting any spender address into the `data` field. A non-zero first word means the spender is flagged.

### 6. Run the full live loop (optional)

This step needs credentials, so it is the only part that is not zero-setup.

1. Create a `.env` file in the repository root. It is gitignored. Populate it with the deployer and demo-owner private keys, the deployed contract addresses, the demo token address, and:
   - `ANTHROPIC_API_KEY` for the decide step.
   - The `onchainos` CLI authenticated for the TEE wallet, so the act step can sign through the TEE.
2. Start the loop, pointing it near the current head so it does not replay hundreds of thousands of blocks catching up:

```bash
python3 -m agent.loop --follow --from-block $(cast block-number --rpc-url https://testrpc.xlayer.tech/terigon)
```

You will see it scan block by block, flag an unlimited approval, print the LLM verdict, then record and (for a guarded account with a malicious verdict) revoke.

### 7. Build the frontend (optional)

```bash
cd frontend
npm install
npm run build     # emits the static site into ../docs
cd ..
```

Serve the built output with `cd docs && python3 -m http.server 8000` and open `http://localhost:8000`. Note the site is built with the base path `/daegis-agent/`, so it is served under `http://localhost:8000/daegis-agent/`. It reads the registry live and verifies each published reasoning against its on-chain hash in the browser.

---

## Test coverage

`131` tests, all green: `82` in Python and `49` in Foundry.

The agent tests run against real captured chain data, not synthetic fixtures. The selector-extraction tests parse the two real spender contracts' actual on-chain bytecode. The third-party-drain discriminator is tested against the real addresses from the planted drain. The detector fixture holds a real captured ERC-721 `Approval` log whose `tokenId` is `type(uint256).max`, which is the exact case a naive topic-only filter would misread as an unlimited allowance.

The Foundry suite carries the safety proof behind the pitch: it fuzzes arbitrary calldata from the guardian and asserts that every call that is not `revoke` reverts.

---

## Status and roadmap

Done and proven:

- Contracts deployed and source-verified on both X Layer mainnet and testnet.
- Detection running against real approvals, with no mocks in the detect or decide path.
- LLM verdict proven to separate a drainer from a router on identical unlimited approvals, citing specific bytecode evidence.
- Full detect, decide, act loop running unattended with no manual steps.
- TEE integration proven: the OKX TEE Agentic Wallet is the single identity that records verdicts and revokes approvals, and the agent holds no private key.
- Public frontend live, reading from real on-chain data.

Still ahead:

- A free-tier alert flow. The registry reader is already public, so the missing piece is letting any wallet register an address and get notified when a spender it approved gets flagged. That needs a small persistence layer.
- Widening the guarded-account model past the demo whitelist, with the same one-function guardian guarantee.

---

## License

MIT.
