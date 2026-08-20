# Build notes

This is the honest record of how DAegis got built: what broke, how I figured out why, and what actually fixed it. I am keeping it first person and specific, because the polished README cannot show the parts where I was wrong for a while before I was right.

## Why I built this

Everyone on X Layer is chasing alpha with AI agents right now. Trading bots, yield optimizers, arbitrage watchers, all racing each other for edge. That is fine, but it means the whole ecosystem is pointed at making people money and almost nobody is pointed at keeping them safe while they use all of it. Every one of those agents runs on approvals. The average wallet is quietly sitting on a pile of forgotten token approvals, any one of which is a live permission for some contract to drain that token whenever it wants. People sign them and forget them. The drainer does not forget.

So I built the other kind of agent. Not the one trying to squeeze yield out of you, the one watching your back while the yield bots do their thing. It detects a dangerous approval, reasons about whether the spender is actually hostile, and for wallets that opt in, revokes the approval on-chain before anything moves. I would rather have built the thing that protects people than one more bot trying to profit from them.

Everything below is how that got real.

## The machine I was building on

I built this entire project on an Android phone. A Dimensity 810 with 4 GB of RAM, running Termux, with the actual toolchain living inside a proot-distro Ubuntu chroot. No laptop, no Docker, no cloud runtime, no paid tiers. That constraint was not a footnote, it shaped nearly every technical decision I made.

The binding limit is memory, and the second limit is that aarch64 prebuilt wheels are a coin flip. Any dependency that wanted to compile native code, or worse, compile Rust, was a risk of either failing outright or thrashing the phone into swap. So I made a rule early: prefer the standard library and prefer shelling out to a tool that already works over pulling a fragile package.

That rule cashed out in three specific calls.

First, the detector talks to the JSON-RPC endpoint with `urllib.request` from the Python standard library, not web3.py and not a heavier RPC client. There is nothing to install and nothing to compile. The chunked `eth_getLogs` poller, the log decoding, the unlimited-allowance filter, all of it is stdlib.

Second, I never brought in the Anthropic SDK for the decide step. The LLM call goes out over the same plain HTTP path. One less dependency tree to resolve on aarch64.

Third, and this is the one that mattered most, all signing goes through the Foundry `cast` binary as a subprocess, not through eth-account or any native secp256k1 wheel. A native crypto wheel on this architecture was exactly the kind of thing that would install cleanly and then segfault, or refuse to build at all. Foundry was already installed and already the signer for deployments, so I leaned on it everywhere. The same "shell out to a trusted CLI" pattern is how the agent talks to the OKX `onchainos` tool too. Later, when I rotated signing onto the TEE wallet, that decision paid off again, because the agent stopped holding a signing key at all and just built calldata for a trusted binary to sign.

None of this was premature caution. I hit enough slow installs and aarch64 warnings early on to know that every avoided native dependency was a demo that would not die on me at the wrong moment.

## The verification wall, and the metadata trap underneath it

Deploying the contracts with `forge create` was straightforward. Verifying the source on the explorer was not, and it cost me real time.

The clean path is `forge verify-contract` against OKLink's API. That path needs an OKLink API key. Getting the key needs an account that clears their KYC, and I could not complete that. So the CLI verification route was closed to me, full stop, and no amount of retrying the command was going to open it.

The pivot was to verify manually through the OKLink explorer's web UI instead, pasting the contract source in and letting the explorer recompile and match bytecode. That works without an API key. It sounds simple. It was not, because of a metadata detail that fails silently until you understand it.

Solidity appends a metadata hash to the end of the deployed bytecode by default. When I first tried to verify with a flattened single file, the explorer's recompiled bytecode did not match what was on-chain, and the reason was that my `foundry.toml` had `bytecode_hash = "none"` while a naive recompile uses the default setting. That default produces bytecode 41 bytes longer than what I deployed. Those 41 bytes are the difference between "verified" and "does not match," and nothing in the error tells you that is what happened.

Two things fixed it for good. I pinned the exact compiler settings in `foundry.toml` and treated them as load-bearing rather than incidental: `solc 0.8.35`, optimizer on at 200 runs, `evm_version = "paris"`, and `bytecode_hash = "none"`. Then, instead of submitting a flattened file and hoping the explorer's settings matched mine, I used Standard-JSON-Input mode, which carries all of those settings explicitly inside the submission. The JSON says exactly how the bytecode was produced, so there is nothing left to guess. That matched on both testnet and, later, mainnet.

The lesson I wrote into the project notes so I would not relearn it: verification is a bytecode-identity check, and a drifting compiler setting between deploy and verify is a guaranteed failure that looks like a mystery.

## The token-scan dead end

For Phase 3, the decide step, I thought I had my LLM's input already solved. OKX's `onchainos` CLI ships a `security token-scan` command, and my early project notes literally assumed I would feed its output into the verdict. Honeypot detection, tax analysis, mint risk, all of it handed to me. I was pleased with myself for finding it before writing custom scanning logic.

Then I actually tested it, and it fell apart on contact in two separate ways.

The first problem was reach. I pointed `token-scan` at a testnet token and got back `Unsupported chainId: 1952`. It supports X Layer mainnet, chain 196, and Ethereum mainnet, chain 1, and it does not support X Layer testnet at all. My whole demo, the planted drainer and the benign router, lives on testnet. So the tool could not see any of the contracts I actually needed judged.

The second problem was worse, and it would have mattered even on a supported chain. `token-scan` is a token-economics scanner. Every one of its fields is about the token itself: is it a honeypot, what are the buy and sell taxes, is it mintable, is the source unverified, is the liquidity fake. Not one field describes approval-abuse or drainer behavior. It would happily tell me a token is clean while saying nothing about whether the spender I approved is going to sweep my balance. It cannot tell a drainer from a DEX router, because that distinction is not a token property at all, it is a property of the spender contract.

So I threw the assumption out. The verdict input had to be built from RPC evidence about the spender, not from a token scanner. I decode the spender's bytecode into the function selectors it exposes and the ones it calls internally, I pull its recent approval and transfer history from the logs, and I check whether its source is verified. That is what goes to the LLM. The selectors turned out to be the sharpest signal, and I extracted them from the real on-chain bytecode with a small PUSH4 scan. I wrote a blunt warning to myself in the notes not to wire `token-scan` back into the verdict prompt later, because the idea is seductive and wrong.

## The moment the router almost got flagged

This is the episode that convinced me the LLM was not decoration.

I deployed two spender contracts for the demo. A DrainerSpender that is genuinely hostile, and a RouterSpender that is a benign trap: it behaves like a real DEX router and needs an unlimited approval to function, exactly like a legitimate protocol would. Both received the same unlimited approval from the same account. The entire point was to see whether the system could tell them apart, because a denylist or an allowance-size heuristic cannot.

My first verdict prompt nearly failed the test. Looking only at the argument shapes and the surface selectors, the two contracts are close enough to fool a shallow reading. Both take token addresses. Both call `transferFrom`. If you reason primarily from "this contract can pull approved tokens," the router looks as guilty as the drainer, and the LLM was on the edge of flagging it. A false positive there is the worst possible outcome for this product, because revoking a legitimate router's approval breaks the user's actual DeFi activity. The thing that is supposed to protect you becomes the thing that breaks your swaps.

Diagnosing it meant looking hard at what actually separates the two in bytecode. The drainer exposes an `attacker()` getter, a hard-coded beneficiary address, and a `claim(address,address)` that takes an arbitrary victim. The router exposes only `swap(address,uint256)` and, crucially, its `transferFrom` only ever pulls from `msg.sender`. The drainer moves other people's tokens to a fixed address it chose in advance. The router moves its own caller's tokens. That is the whole difference, and it is a behavioral difference, not a structural-shape difference.

The fix was to restructure the evidence and the prompt so that behavior beats shape. I lead the evidence with the decoded selectors, because `attacker()` is a dead giveaway that shape alone misses, and I make the transfer logs dispositive: what the contract has actually done, and to whom, outweighs what its function signatures superficially resemble. Once the transfer history and the hard-coded-beneficiary tell were the primary inputs, the verdicts separated cleanly and correctly. Drainer malicious at 95, router suspicious at 50 and left un-revoked.

That is the case I point to when someone asks why this needs an LLM. The distinction is semantic. It is about intent inferred from behavior, and it is exactly the kind of judgment a static rule cannot make and a model reasoning over real evidence can.

## The buffering bug that lied about its own work

In Phase 2, the detector ran for long stretches with its output redirected to a file. It looked like it was working. It was not telling me the truth.

Python block-buffers a redirected stream. So the poller would scan blocks, advance its cursor, and hold all of its output in a buffer that never got written. From the outside, the log file was empty while the cursor kept moving forward. Worse, when the process took a SIGTERM, the buffer was discarded, so any detections it had found in that window were simply gone. The cursor said those blocks were scanned. The detections from them had evaporated. That is the most dangerous class of bug in a security tool: it silently drops the exact events it exists to catch, while reporting that it did its job.

I found it the hard way during a live run, by noticing that a detection I knew should have landed was not in the log, even though the cursor had moved past its block. The fix in Phase 2 was an `emit()` helper that prints and flushes immediately, so every line hits the file the moment it is produced instead of waiting for a buffer to fill.

Then it came back during demo prep, in a different shape. Running the full `--follow` loop, output was getting swallowed again even though `emit()` was flushing. The per-line flush empties Python's own buffer, but that is not always enough. When stdout is a pipe, a terminal multiplexer, or an editor's integrated terminal, the interpreter can still block-buffer at a layer the flush does not reach, and some environments hold output until the process exits regardless. For a live demo where I needed the scan to visibly stream, that was unacceptable.

The fix was an `unbuffer_stdout()` function called at the start of both the loop and the detector. It reconfigures stdout and stderr with write-through enabled, which is the in-code equivalent of running Python with `-u`. I chose the in-code version deliberately, so the guarantee holds no matter how the process gets launched, rather than depending on remembering a flag. While I was in there I added a per-poll heartbeat line, because the loop was previously silent between detections, and silence on camera looks like a crash. Now it prints the range it scanned every poll, so you can see it is alive and working even when nothing is flagged.

Two buffering bugs, same root cause family, both fixed by refusing to trust that "it printed" means "it reached the terminal."

## Rotating trust onto the TEE without a leap of faith

The end state I wanted was for the agent to hold no signing key at all. The OKX TEE Agentic Wallet would be both the registry's agent, writing verdicts, and the guarded account's guardian, doing revokes, with the private key living inside OKX's TEE and never on my machine.

The problem is a chicken-and-egg. I did not want to grant the TEE wallet real authority over the guarded account until I had proof it could actually execute a `contract-call` and land a transaction. But the function I most wanted to prove, `revoke`, is `onlyGuardian`, and before the rotation the TEE wallet was not the guardian. So a TEE-signed `revoke` could not succeed yet. It would revert. That is the exact shape of a chicken-and-egg: I needed the capability proven before granting authority, and the capability I cared about required the authority.

I untangled it with two separate proofs rather than one risky leap.

For the "does the call even reach the right place with the right sender" question, I used an `eth_call` disambiguation. I simulated the `revoke` from the TEE wallet's address and read the revert. It reverted with `NotGuardian` naming the TEE wallet's own smart-account address. That was the strongest possible signal short of a live transaction: it proved the call reached `revoke`, and it proved the `msg.sender` the contract saw was the TEE smart-account address itself, not some bundler or EntryPoint address. The same calldata simulated from the real guardian returned success. So the only thing standing between the TEE and a working revoke was the guardian role, exactly as intended.

For the "can the TEE actually land a state-changing transaction at all" question, I could not use `revoke`, because the OKX backend refuses to submit any call whose gas estimation reverts, and a non-guardian revoke reverts. So I proved it with a harmless call instead: a public `mint` of zero tokens to the TEE wallet, which changes state trivially and reverts for nobody. That UserOp landed, signed inside the TEE, with the TEE smart-account as sender. Capability proven, separately from authority.

Only after both proofs did I do the rotation. The demo owner called `setGuardian` to hand guardianship to the TEE, and the deployer called `setAgent` to hand it write access to the registry. Then the full unattended loop ran end to end on the TEE identity: a planted approval detected, judged malicious, recorded by a TEE UserOp, and revoked by a TEE UserOp, no key on my machine at any point. I kept a written rollback path too, because rotating authority you cannot instantly reverse is the kind of thing you want an exit from.

## Taking it to mainnet

Everything above proved out on testnet, and the last real-money step was mainnet.

First I had to actually acquire OKB and get it to the right place, which on this setup is not trivial. Then I generated a fresh mainnet deployer key. I was careful about this: the key had to be one that never touched testnet, never appeared in any commit or log, and lived only in a gitignored `.env` with tight file permissions. I generated it so that the private key never printed to the terminal at all, and I verified it by re-deriving its address from the stored key rather than by ever displaying the secret. Only the address ever showed up: `0x1Ef13A6887B6Dd1f3A039bcF35AfC44aDE95e576`.

The deploy itself reused the same contracts and the same pinned compiler settings. One small snag: `forge create` parsed my `--broadcast` flag as an extra constructor argument the first time, because of where I put it in the command, and refused with a count mismatch. Moving the flag ahead of `--constructor-args` fixed it. Both contracts went out, and I read every role back from chain to confirm the deployer held owner, agent, and guardian as expected before trusting any of it. Then I verified the source on the mainnet explorer the same manual Standard-JSON-Input way as testnet, because the API-key wall is the same on mainnet.

The mainnet ThreatRegistry is at `0x7c4b62d1e48a33a26440f64eb7c696b3986cf1d2` and the GuardedAccount is at `0x8d0f7b2c2782d69cdaaef13ac7b32f80a455670a`, both verified.

## The frontend, and the data that was not real

The site went through two builds, and I am glad I did not skip straight to the second.

I built a vanilla static site first. Plain HTML, CSS, and JavaScript, no build step, reading the registry live over JSON-RPC and verifying reasoning hashes in the browser. It worked and it was honest, and it gave me a known-good reference for what the real on-chain values were.

Then I wanted a heavier, nicer React frontend. The first question was not "is it prettier," it was "will it even build on a 4 GB phone." React plus Vite plus Tailwind's newer Rust-based toolchain is exactly the kind of stack that can either need a Rust compile or thrash this device into the ground. So I timeboxed a spike: one hour, in a throwaway directory nowhere near the real repo, to find out whether `npm install` and `npm run build` would actually complete here. If it failed, I would report what failed and not try to force it. It passed, using prebuilt aarch64 binaries so nothing had to compile from source, with builds landing in a workable time. Only then did I commit to the switch.

The switch surfaced the ugliest surprise of the frontend work. The reference React frontend I had been handed was built on entirely fabricated data. Its registry module was mock data pretending to be real: a wrong GuardedAccount address, invented transaction hashes, four contracts that do not exist, and, most damning, the benign router shown as safe at a low risk score when the real on-chain verdict flags it at 50. The component rendered pure fiction and would have shown fiction to judges. There was also a silent fallback to mock data when a read failed, and a fake hash-verification path that always claimed success.

I ripped all of it out. I deleted the mock module entirely, ported the proven read-and-verify logic from my vanilla site into the React service layer, and rewired every component to real on-chain reads with honest error states and real keccak verification. Then I walked every single number, address, and verdict that would render on the live site against the actual chain before letting it build, because after finding one layer of fabricated data I was not going to trust that there was only one. The hero's allowance line, which I could have left as a static number, I wired to a live `allowance()` call, on the principle that everything on that page should be either an immutable historical fact or a live-verified value, with nothing in between.

## The stale registry, caught on camera

The last real bug I found while recording the demo. I would trigger a fresh verdict on chain, confirm with a direct `isFlagged()` call that the new state was live, then refresh the site, and the registry would show the old data.

The component itself was fine. It refetches on every mount, so a refresh always re-runs the load. The staleness was in the fetch layer. None of the registry's network reads opted out of the browser HTTP cache, so on a refresh the browser was free to serve a stored response from a previous load instead of hitting the network. The static seed and reasoning JSON files were the obvious culprits, and defensively the RPC POST could be served stale in some browsers too. So the page could render yesterday's state while the chain, and a direct call, had already moved on.

The fix was small and surgical: mark every registry data read `cache: 'no-store'`, at all three fetch sites, and nothing else. The RPC call, the reasoning fetch, and the seed-list fetch. Now every load and every refresh reflects current chain state. I checked the built bundle to confirm the change actually shipped, because a fix that does not make it through the build is not a fix.

## Other things that bit me

A few smaller ones worth recording, because they were real.

The testnet RPC caps `eth_getLogs` at a 100-block span and rejects anything wider outright. That is not documented by OKX, I measured it. It means every scan has to be chunked, and it is a correctness requirement, not a tuning knob, because an unchunked backfill fails instead of returning partial results. Block time measured at a steady one second, so one full-size log window covers 100 seconds of chain.

ERC-721 shares the exact same `Approval` topic hash as ERC-20, because the event signature strings are identical. Filtering on the topic alone ingests NFT approvals and decodes a token ID as if it were an allowance, and a high token ID reads as an unlimited approval, which is a false positive in the one place this project cannot afford one. I discriminate on event shape instead, and I have a real captured ERC-721 log in the test fixtures whose token ID is the maximum uint256, precisely the case that would fool a topic-only filter.

The demo helper for planting an approval reverted the first time with a generic "call failed," and I chased it correctly: the guarded account's `execute` bubbles the inner call's revert, and an empty revert like that means the token got calldata whose selector matched no function. The cause was the long calldata hex getting mangled when a multi-line command was pasted. I re-derived the calldata cleanly, dry-ran the whole thing with `eth_call` before ever broadcasting, and once the dry run returned success I dropped it into a small script so there was no paste to mangle.

Finally, when I wanted to preview the base-pathed build locally, serving the `docs` folder at the web root gave 404s on every asset, because the build hard-codes the `/daegis-agent/` base path for GitHub Pages. I served it through a symlink so the path matched, rather than changing the build. Related: the in-page logo briefly fell back to a default shield because a component hard-coded an absolute `/logo.jpg` that resolves outside the base path on Pages. Prefixing it with the build's base URL, the way the rest of the app already did, fixed it.

## What is still ahead

I am not going to pretend this is finished.

The free-tier alert flow is the biggest missing piece. The registry is already public and free to read, so the idea is that any wallet can register an address and get told when a spender it approved gets flagged. That needs a small persistence layer, and I scoped it out of this build deliberately rather than half-build it under deadline.

The guarded-account model is proven but narrow. Auto-revoke is restricted to a whitelist of demo accounts on purpose, because letting an agent revoke approvals on arbitrary wallets is exactly the kind of authority you do not hand out casually. Widening it, while keeping the one-function guardian guarantee that makes it safe, is real design work, not a config change.

And the mainnet identity rotation, moving agent and guardian onto the TEE wallet on mainnet the way I already did on testnet, is the natural next step now that the contracts are live and verified there.

I made a lot of hard calls under a deadline on a phone with 4 GB of RAM. I can defend every one of them, and this document is where I show my work.
