# DAegis

Autonomous AI agent that flags dangerous token approvals on X Layer, free for any
wallet or dApp to read, and revokes them on-chain for wallets that opt into a
guarded smart account.

Built for the **OKX Build-X Hackathon, AI Season**.

---

## The result, first

On X Layer testnet, a malicious contract received an unlimited token approval from a
guarded account. DAegis caught it and set the allowance back to zero **before a
single token moved**.

| Event | Block | Transaction |
|---|---|---|
| Unlimited approval to a flagged spender lands | `38340097` | [`0x8137a8a7...5ad0`](https://www.okx.com/web3/explorer/xlayer-test/tx/0x8137a8a7578ddfa58b3c5c34f97654c20d28ea42e70e2caee4872ef4781d5ad0) |
| Guardian sets the allowance to `0` | `38340188` | [`0xbf96b638...ce2f`](https://www.okx.com/web3/explorer/xlayer-test/tx/0xbf96b638e8dffb62cf6561e1dbd04e4bf7d08c48331ef0d192d807e5ed4ace2f) |

That is a gap of `91` blocks, about 91 seconds at X Layer's one-second block time.
The verdict recorded `0` observed token movements: the revoke was pre-emptive, so the
drain never executed. The spender's allowance on that account still reads `0`
on-chain today. Every hash above is a real transaction on the OKX explorer.

The revoke was signed by the **OKX TEE Agentic Wallet**, not by any private key on the
machine running the agent (see [Architecture](#architecture)).

---

## What it does

DAegis runs one loop, unattended: **Detect, Decide, Act.**

**Detect.** A poller reads `Approval` logs from X Layer in chunks and filters for
unlimited allowances. Unlimited-allowance detection alone is a rule a regex could
write, so it is only the trigger, never the verdict.

**Decide.** For each flagged approval, the agent gathers real evidence: the spender's
bytecode (decoded into the function selectors it exposes and the ones it calls),
recent approval and transfer history, and verified-source status. That evidence goes
to an LLM, which returns a structured verdict (`malicious`, `suspicious`, or `benign`),
a risk score `0-100`, and one to three sentences of reasoning that **cite the specific
evidence**, not a guess.

**Act.** The verdict is written to a public on-chain registry. If the verdict is
`malicious` and the approval's owner is a guarded account, the guardian revokes the
approval by setting it to `0`. Benign spenders are not recorded (the registry is a
threat feed; recording legitimate approvals dilutes the signal).

---

## Why an LLM and not a heuristic

This is the core technical claim, so here is the proof rather than the assertion.

Two spender contracts were deployed on testnet and each received the **same unlimited
approval** from the **same guarded account**. A heuristic keyed on "unlimited
allowance" flags both identically. DAegis, reading each contract's bytecode, reaches
opposite and correct verdicts.

**DrainerSpender** [`0xe9eb89da...F7D5`](https://www.okx.com/web3/explorer/xlayer-test/address/0xe9eb89da7a2dF4Bd1A644d737bAEFf1dDE87F7D5)
-> `malicious`, risk `95`, **revoked**.

> The contract exposes an `attacker()` getter function, which is a hard-coded
> structural drainer tell, no legitimate protocol has any reason to expose such an
> endpoint. Combined with `claim(address,address)` invoking `transferFrom` on approved
> tokens and an unverified source, this contract is structurally designed to drain the
> owner's unlimited approval. No observed token movements yet, but the `attacker()`
> getter alone is sufficient grounds for a malicious verdict.

**RouterSpender** [`0x122589dF...5ED0`](https://www.okx.com/web3/explorer/xlayer-test/address/0x122589dF6fC8BF65500927dbcb87906bbA715ED0)
-> `suspicious`, risk `50`, **not revoked**.

> The contract exposes only `swap(address,uint256)` and calls `transferFrom`, which is
> consistent with a legitimate router but also with a drainer. Unverified source and
> the absence of any observed transfer history leave the approval's legitimacy
> unconfirmed.

Same input signal, opposite outcomes. The drainer hard-codes where funds go
(`attacker()`) and takes an arbitrary victim address in `claim`, so it is drained and
revoked. The router only ever pulls from its own caller (`transferFrom(msg.sender, ...)`)
and has no hard-coded beneficiary, so it is recorded for watching but its approval is
left intact, exactly as a real DEX router would need. A denylist cannot make that
distinction. Reasoning over the contract's behavior can.

The full reasoning text is stored off-chain and its `keccak256` hash is pinned
on-chain in the registry, so the prose is tamper-evident: anyone can recompute the
hash and confirm the reasoning was not edited after the fact.

---

## Live deployment

Both contracts are deployed and source-verified on **X Layer testnet (chain ID `1952`)**,
built with `solc 0.8.35`, `evm_version = "paris"`, optimizer on at 200 runs.

| Contract | Address | Deploy tx | Deploy gas |
|---|---|---|---|
| `ThreatRegistry` | [`0x7f9C1eB88cB6cc7D098a3ba1aDe13b57761b48D9`](https://www.okx.com/web3/explorer/xlayer-test/address/0x7f9C1eB88cB6cc7D098a3ba1aDe13b57761b48D9) | `0x5ec00443...24f3` | `384,647` |
| `GuardedAccount` | [`0x273650d9001F1C7dD6Ba098C22cBA045743c9DDf`](https://www.okx.com/web3/explorer/xlayer-test/address/0x273650d9001F1C7dD6Ba098C22cBA045743c9DDf) | `0x16a1c25e...281a` | `532,789` |

The registry read is public and free. Anyone can query any spender with a single
`eth_call`, no key and no account required:

```bash
curl -s https://testrpc.xlayer.tech/terigon \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{
    "to":"0x7f9C1eB88cB6cc7D098a3ba1aDe13b57761b48D9",
    "data":"0xfef48a99000000000000000000000000e9eb89da7a2df4bd1a644d737baeff1dde87f7d5"
  },"latest"]}'
# returns (bool flagged, uint8 riskScore, bytes32 reasonHash) for the drainer above
```

---

## Architecture

```
                         X Layer testnet (chain 1952)
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

A single identity, the OKX TEE Agentic Wallet
(`0x3c7acf83bb12e082e4e86a6eb5479a8d42a7c465`), is **both** the registry's `agent`
(the only address allowed to write verdicts) **and** the guarded account's `guardian`
(the only address allowed to revoke). The rotation onto that wallet is on-chain:
`setGuardian` in [`0x7e9fd3a8...f264b`](https://www.okx.com/web3/explorer/xlayer-test/tx/0x7e9fd3a804d29fc773565a1c000de164199e52b9f96f6d64350fcef75d8f264b)
and `setAgent` in [`0xa20add2e...b7b`](https://www.okx.com/web3/explorer/xlayer-test/tx/0xa20add2e2e8097c3a388c62aa017b0791d3061d26c75cf3078e62ad67cd23b7b).

Because that wallet signs inside OKX's TEE, the agent process holds **no private key
for any on-chain action**. It builds calldata locally, hands it to the `onchainos`
CLI, and the TEE produces the ERC-4337 UserOp. An unattended run proves the whole
path end to end: a planted approval at block `38355001` was detected, judged
`malicious 95`, recorded ([`0xadb53572...dbe93`](https://www.okx.com/web3/explorer/xlayer-test/tx/0xadb5357209902b7f112b5c762b4ca8f6e50916268ca19b1e4ed62d15c41dbe93)),
and revoked ([`0xc2ab1f78...ce2f`](https://www.okx.com/web3/explorer/xlayer-test/tx/0xc2ab1f78479ed92a65c2ae77787d2878a1df3c7f00a4888e5ef22d8f9674a452)),
with no manual step. Both write transactions have the TEE wallet as their sender.

---

## What makes this different

Revoke.cash and Web3 Antivirus scan approvals and leave you to revoke by hand. DAegis
combines three things none of them do together:

1. **A public on-chain registry** anyone can query for free. `isFlagged(address)` is a
   view call with no fee, no account, and no permission. The verdicts are shared
   infrastructure, not a product behind a login.
2. **An LLM reasoning over contract behavior**, not a static denylist. The verdict
   comes from the spender's actual bytecode and history, so a brand-new drainer with
   an address no blocklist has seen is still caught, and a legitimate router is not
   falsely revoked (shown above).
3. **A guarded smart account whose only power is to revoke.** The guardian can call
   exactly one function, `revoke(token, spender)`, which sets an approval to zero. It
   cannot move tokens, cannot change the owner, and cannot change the guardian, not
   even to itself. This is not a promise, it is the shape of the contract, and a test
   asserts that every other call from the guardian reverts.

---

## Running it locally

The contracts and the agent run from a standard Foundry plus Python toolchain.

```bash
git clone https://github.com/wilcardjayx/daegis-agent.git
cd daegis-agent

# 1. Contracts: build and run the full test suite (no network needed)
cd contracts
forge build
forge test
cd ..

# 2. Agent: no third-party Python packages, standard library only
python3 -m unittest discover -s agent/tests -p 'test_*.py'
```

To run the live loop against testnet you need a `.env` (gitignored) with the deployer
and demo-owner keys, an `ANTHROPIC_API_KEY` for the verdict step, and the `onchainos`
CLI authenticated for the TEE wallet. Then:

```bash
python3 -m agent.loop --follow --from-block <block>
```

You do not need to run anything to verify the central claims: the contracts are
verified on the explorer, and the `eth_call` above returns the drainer's live verdict
from any machine.

The public site lives in `docs/` and is plain static HTML, CSS, and JavaScript with
no build step. Serve it locally with `cd docs && python3 -m http.server 8000` and open
`http://localhost:8000`. It reads the registry live and verifies each published
reasoning against its on-chain hash in the browser.

---

## Test coverage

`131` tests, all green: `82` Python and `49` Foundry.

The agent tests run against **real captured chain data**, not synthetic fixtures. The
selector-extraction tests parse the two real spender contracts' actual on-chain
bytecode; the third-party-drain discriminator is tested against the real addresses
from the planted drain; and the detector fixture holds a real captured ERC-721
`Approval` log whose `tokenId` is `type(uint256).max`, the exact case that a naive
topic-only filter would misread as an unlimited allowance.

The Foundry suite includes the safety proof behind the pitch: it fuzzes arbitrary
calldata from the guardian and asserts that every call that is not `revoke` reverts.

---

## Status and roadmap

**Done and proven on X Layer testnet:**

- Contracts deployed and source-verified (`ThreatRegistry`, `GuardedAccount`).
- Detection live against real approvals, no mocks in the detect or decide path.
- LLM verdict proven to separate a drainer from a router on identical unlimited
  approvals, citing specific bytecode evidence.
- Full detect-decide-act loop runs unattended, no manual steps.
- TEE integration proven: the OKX TEE Agentic Wallet is the single identity that
  records verdicts and revokes approvals, with no private key held by the agent.

**In progress:**

- Public frontend: built in `docs/`, deploying to GitHub Pages.
- Free-tier alert registration: the registry reader is live; letting any wallet
  register for alerts needs a persistence layer and is the next piece.
- Mainnet deployment: the same contracts, redeployed to X Layer mainnet.

---

## License

MIT.
