// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @title GuardedAccount
/// @notice A smart account whose owner keeps full control, and whose guardian —
///         the DAegis agent — has exactly one power: setting a token approval
///         to zero.
///
/// This asymmetry IS the pitch (SPEC.md "Differentiation"). Every other product
/// in this space either scans and leaves you to revoke by hand, or asks for a
/// delegation broad enough to move your funds. The guardian here cannot:
///   - move tokens or native OKB
///   - change the owner
///   - change the guardian (not even to itself)
///   - execute arbitrary calldata
///
/// The enforcement is structural, not a policy check: `revoke` is the only
/// non-view function a guardian can enter, and it hardcodes the call it makes.
/// The guardian supplies two addresses and nothing else — no calldata, no value,
/// no amount. The amount is the literal constant 0.
///
/// GuardedAccount.t.sol proves this two ways: it fuzzes arbitrary calldata from
/// the guardian and asserts every call that isn't `revoke` reverts, and it walks
/// each declared owner-only function by name doing the same. Do not weaken those
/// tests; they are the evidence behind the README's safety claim. Any function
/// added to this contract must be added to the named list in that file.
contract GuardedAccount {
    /// @notice Full control, always.
    address public owner;

    /// @notice The DAegis agent. May only call `revoke`.
    address public guardian;

    event ApprovalRevoked(address indexed token, address indexed spender, address indexed caller);
    event Executed(address indexed target, uint256 value, bytes data);
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner(address caller);
    error NotGuardian(address caller);
    error ZeroAddress();
    error ApproveFailed(address token, address spender);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    /// @dev Deliberately NOT `onlyOwnerOrGuardian`. The guardian's authority is
    ///      one function wide; the owner reaches the same effect through
    ///      `execute`, so widening this would add surface for zero capability.
    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian(msg.sender);
        _;
    }

    constructor(address owner_, address guardian_) {
        if (owner_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        owner = owner_;
        guardian = guardian_;
        emit OwnershipTransferred(address(0), owner_);
        emit GuardianUpdated(address(0), guardian_);
    }

    /// @notice Accept native OKB. Anyone may fund the account; only the owner
    ///         can ever get it back out (via `execute`).
    receive() external payable {}

    // -------------------------------------------------------------------------
    // Guardian surface — this is the whole of it
    // -------------------------------------------------------------------------

    /// @notice Set this account's approval of `spender` on `token` to zero.
    /// @dev The only state-changing function the guardian can reach. Note what
    ///      the caller does NOT control: the selector (fixed to `approve`) and
    ///      the amount (fixed to 0). A hostile guardian passing an attacker
    ///      contract as `token` achieves nothing — the call runs in that
    ///      contract's context, not this account's, and re-entering this account
    ///      fails because `msg.sender` is then the token, neither owner nor
    ///      guardian. `test_RevertWhen_GuardianUsesMaliciousTokenToReenter`
    ///      pins that down.
    function revoke(address token, address spender) external onlyGuardian {
        _approveZero(token, spender);
        emit ApprovalRevoked(token, spender, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Owner surface
    // -------------------------------------------------------------------------

    /// @notice Arbitrary call from the account. This is what "owner keeps full
    ///         control" means concretely — including revoking approvals without
    ///         the guardian, if the guardian key is ever lost.
    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyOwner
        returns (bytes memory)
    {
        if (target == address(0)) revert ZeroAddress();
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        if (!ok) _bubbleRevert(ret);
        emit Executed(target, value, data);
        return ret;
    }

    /// @notice Replace the guardian, or drop guardianship by pointing it at a
    ///         burn address. Owner only — a guardian cannot renew or extend itself.
    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    /// @dev Low-level rather than `IERC20(token).approve(...)` so that tokens
    ///      which return nothing (USDT-style) are handled instead of reverting
    ///      on the ABI decode. Success requires either an empty return or a
    ///      decoded `true`.
    function _approveZero(address token, address spender) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20.approve, (spender, 0)));
        if (!ok) revert ApproveFailed(token, spender);
        if (ret.length != 0 && (ret.length < 32 || !abi.decode(ret, (bool)))) {
            revert ApproveFailed(token, spender);
        }
    }

    /// @dev Re-throw the callee's revert data so owner debugging isn't blind.
    function _bubbleRevert(bytes memory ret) private pure {
        if (ret.length == 0) revert("GuardedAccount: call failed");
        assembly {
            revert(add(ret, 0x20), mload(ret))
        }
    }
}
