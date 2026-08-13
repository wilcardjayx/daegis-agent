// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @title ThreatRegistry
/// @notice Public, free-to-read record of spender contracts the DAegis agent has
///         judged dangerous on X Layer.
///
/// Design notes (see SPEC.md "Contracts"):
///   - Writes are agent-only. Reads are open to anyone, forever, with no fee and
///     no registration — this is the half of the pitch that isn't the demo.
///   - The LLM's actual reasoning text lives OFF-CHAIN. Only its hash is pinned
///     here (`reasonHash`), keyed so the public page can fetch the prose and
///     prove it wasn't edited after the fact. Storing paragraphs of LLM output
///     on-chain would be expensive and pointless.
///   - `SpenderFlagged` is the single subscription point: the free-tier alert
///     watcher and the public page both read this event, nothing else.
contract ThreatRegistry {
    /// @notice One verdict about one spender.
    /// @param riskScore  0-100. Higher is worse. 0 with a nonzero `flaggedAt`
    ///                   means "the agent looked and considered it benign".
    /// @param flaggedAt  Block timestamp of the most recent `record`. Zero means
    ///                   never recorded — this is the existence check.
    /// @param reasonHash keccak256 of the off-chain reasoning document.
    struct Verdict {
        uint8 riskScore;
        uint40 flaggedAt;
        bytes32 reasonHash;
    }

    /// @notice Risk scores are a 0-100 scale. Anything above is a caller bug, not
    ///         a more urgent warning — reject it rather than store nonsense.
    uint8 public constant MAX_RISK_SCORE = 100;

    /// @notice Can rotate the agent. Cannot record verdicts itself.
    address public owner;

    /// @notice The only address allowed to write verdicts.
    address public agent;

    /// @notice Raw verdict storage. The auto-generated getter exposes the
    ///         timestamp too, which `isFlagged` deliberately omits.
    mapping(address spender => Verdict verdict) public verdicts;

    event SpenderFlagged(
        address indexed spender, uint8 riskScore, bytes32 reasonHash, uint256 flaggedAt
    );
    event AgentUpdated(address indexed previousAgent, address indexed newAgent);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotAgent(address caller);
    error NotOwner(address caller);
    error ZeroAddress();
    error InvalidRiskScore(uint8 riskScore);

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent(msg.sender);
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    /// @param agent_ The agent key that will submit verdicts. Deployer becomes owner.
    constructor(address agent_) {
        if (agent_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        agent = agent_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit AgentUpdated(address(0), agent_);
    }

    /// @notice Record (or update) the agent's verdict on a spender.
    /// @dev Re-recording overwrites. That is intentional: a spender's risk can be
    ///      re-assessed with better evidence, and the event log preserves the
    ///      full history for anyone auditing the agent's judgement.
    function record(address spender, uint8 riskScore, bytes32 reasonHash) external onlyAgent {
        if (spender == address(0)) revert ZeroAddress();
        if (riskScore > MAX_RISK_SCORE) revert InvalidRiskScore(riskScore);

        verdicts[spender] =
            Verdict({riskScore: riskScore, flaggedAt: uint40(block.timestamp), reasonHash: reasonHash});

        emit SpenderFlagged(spender, riskScore, reasonHash, block.timestamp);
    }

    /// @notice The public read path. Free, no auth, callable by any wallet or dApp.
    /// @return flagged    True once the agent has recorded any verdict on `spender`.
    /// @return riskScore  0-100, meaningful only when `flagged` is true.
    /// @return reasonHash Hash of the off-chain reasoning, zero if none.
    function isFlagged(address spender)
        external
        view
        returns (bool flagged, uint8 riskScore, bytes32 reasonHash)
    {
        Verdict storage v = verdicts[spender];
        return (v.flaggedAt != 0, v.riskScore, v.reasonHash);
    }

    /// @notice Rotate the agent key (compromise, or the Phase 5 TEE wallet swap).
    function setAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0)) revert ZeroAddress();
        emit AgentUpdated(agent, newAgent);
        agent = newAgent;
    }

    /// @notice Hand the registry to a new owner.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
