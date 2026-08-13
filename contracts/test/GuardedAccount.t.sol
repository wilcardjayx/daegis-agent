// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test} from "forge-std/Test.sol";
import {GuardedAccount} from "../src/GuardedAccount.sol";
import {MockERC20, NoReturnERC20, FalseReturnERC20, ReenteringToken} from "./mocks/MockERC20.sol";

/// @notice The proof behind the README's central safety claim: the guardian's
///         only power is `revoke`.
///
/// CLAUDE.md marks this test file as non-optional. If a future change makes any
/// test here fail, the correct response is to change the contract back — not to
/// relax the test.
contract GuardedAccountTest is Test {
    GuardedAccount internal account;
    MockERC20 internal token;

    address internal owner = makeAddr("owner");
    address internal guardian = makeAddr("guardian");
    address internal spender = makeAddr("maliciousSpender");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant BALANCE = 1_000e18;

    // Public state-variable getters have no `.selector` on the contract type, so
    // they are spelled out. These two are the entire read-only surface; anything
    // else the fuzzer reaches must revert for a guardian.
    bytes4 internal constant OWNER_GETTER = bytes4(keccak256("owner()"));
    bytes4 internal constant GUARDIAN_GETTER = bytes4(keccak256("guardian()"));

    event ApprovalRevoked(address indexed token, address indexed spender, address indexed caller);

    function setUp() public {
        account = new GuardedAccount(owner, guardian);
        token = new MockERC20();
        token.mint(address(account), BALANCE);

        // The account has granted an unlimited approval — the exact situation
        // the agent exists to undo.
        vm.prank(owner);
        account.execute(
            address(token),
            0,
            abi.encodeWithSignature("approve(address,uint256)", spender, type(uint256).max)
        );
        assertEq(token.allowance(address(account), spender), type(uint256).max, "setup approval");
    }

    // -------------------------------------------------------------------------
    // Construction
    // -------------------------------------------------------------------------

    function test_ConstructorSetsRoles() public view {
        assertEq(account.owner(), owner);
        assertEq(account.guardian(), guardian);
    }

    function test_RevertWhen_ConstructedWithZeroOwner() public {
        vm.expectRevert(GuardedAccount.ZeroAddress.selector);
        new GuardedAccount(address(0), guardian);
    }

    function test_RevertWhen_ConstructedWithZeroGuardian() public {
        vm.expectRevert(GuardedAccount.ZeroAddress.selector);
        new GuardedAccount(owner, address(0));
    }

    // -------------------------------------------------------------------------
    // The one thing the guardian CAN do
    // -------------------------------------------------------------------------

    function test_GuardianCanRevoke() public {
        vm.expectEmit(true, true, true, true);
        emit ApprovalRevoked(address(token), spender, guardian);

        vm.prank(guardian);
        account.revoke(address(token), spender);

        assertEq(token.allowance(address(account), spender), 0, "allowance must be zero");
    }

    function test_RevokeLeavesBalanceUntouched() public {
        vm.prank(guardian);
        account.revoke(address(token), spender);
        assertEq(token.balanceOf(address(account)), BALANCE, "revoke must not move funds");
    }

    function test_RevokeHandlesNoReturnToken() public {
        NoReturnERC20 usdtStyle = new NoReturnERC20();
        vm.prank(owner);
        account.execute(
            address(usdtStyle),
            0,
            abi.encodeWithSignature("approve(address,uint256)", spender, type(uint256).max)
        );

        vm.prank(guardian);
        account.revoke(address(usdtStyle), spender);

        assertEq(usdtStyle.allowance(address(account), spender), 0);
    }

    function test_RevertWhen_TokenApproveReturnsFalse() public {
        FalseReturnERC20 liar = new FalseReturnERC20();
        vm.expectRevert(
            abi.encodeWithSelector(GuardedAccount.ApproveFailed.selector, address(liar), spender)
        );
        vm.prank(guardian);
        account.revoke(address(liar), spender);
    }

    function test_RevertWhen_StrangerRevokes() public {
        vm.expectRevert(abi.encodeWithSelector(GuardedAccount.NotGuardian.selector, stranger));
        vm.prank(stranger);
        account.revoke(address(token), spender);
    }

    function test_RevertWhen_OwnerCallsRevokeDirectly() public {
        // Not a limitation: the owner reaches the same effect through `execute`
        // (proved by test_OwnerCanRevokeWithoutGuardian). Keeping `revoke`
        // guardian-only keeps the privileged surface exactly one caller wide.
        vm.expectRevert(abi.encodeWithSelector(GuardedAccount.NotGuardian.selector, owner));
        vm.prank(owner);
        account.revoke(address(token), spender);
    }

    // -------------------------------------------------------------------------
    // Everything the guardian CANNOT do
    // -------------------------------------------------------------------------

    function test_RevertWhen_GuardianExecutesArbitraryCall() public {
        vm.expectRevert(abi.encodeWithSelector(GuardedAccount.NotOwner.selector, guardian));
        vm.prank(guardian);
        account.execute(address(token), 0, "");
    }

    function test_RevertWhen_GuardianMovesTokens() public {
        vm.expectRevert(abi.encodeWithSelector(GuardedAccount.NotOwner.selector, guardian));
        vm.prank(guardian);
        account.execute(
            address(token),
            0,
            abi.encodeWithSignature("transfer(address,uint256)", guardian, BALANCE)
        );

        assertEq(token.balanceOf(address(account)), BALANCE, "tokens must be untouched");
        assertEq(token.balanceOf(guardian), 0, "guardian must gain nothing");
    }

    function test_RevertWhen_GuardianSweepsNativeOKB() public {
        vm.deal(address(account), 5 ether);

        vm.expectRevert(abi.encodeWithSelector(GuardedAccount.NotOwner.selector, guardian));
        vm.prank(guardian);
        account.execute(guardian, 5 ether, "");

        assertEq(address(account).balance, 5 ether, "native balance must be untouched");
        assertEq(guardian.balance, 0, "guardian must gain nothing");
    }

    function test_RevertWhen_GuardianReApprovesSpender() public {
        // The nastiest variant: not stealing, just quietly re-granting the
        // allowance it was supposed to remove.
        vm.expectRevert(abi.encodeWithSelector(GuardedAccount.NotOwner.selector, guardian));
        vm.prank(guardian);
        account.execute(
            address(token),
            0,
            abi.encodeWithSignature("approve(address,uint256)", spender, type(uint256).max)
        );
    }

    function test_RevertWhen_GuardianChangesOwner() public {
        vm.expectRevert(abi.encodeWithSelector(GuardedAccount.NotOwner.selector, guardian));
        vm.prank(guardian);
        account.transferOwnership(guardian);

        assertEq(account.owner(), owner, "owner must be unchanged");
    }

    function test_RevertWhen_GuardianChangesGuardian() public {
        vm.expectRevert(abi.encodeWithSelector(GuardedAccount.NotOwner.selector, guardian));
        vm.prank(guardian);
        account.setGuardian(stranger);

        assertEq(account.guardian(), guardian, "guardian must be unchanged");
    }

    function test_RevertWhen_GuardianUsesMaliciousTokenToReenter() public {
        ReenteringToken hostile = new ReenteringToken(address(account));

        vm.prank(guardian);
        account.revoke(address(hostile), spender);

        assertTrue(hostile.reentryAttempted(), "the hostile token did try");
        assertFalse(hostile.reentrySucceeded(), "re-entry into execute must fail");
    }

    /// @notice The general statement, not a list of examples: for ANY calldata a
    ///         guardian can construct that isn't `revoke` or a read-only getter,
    ///         the call reverts and no state moves. This closes off fallback
    ///         paths and malformed-calldata tricks.
    ///
    /// @dev Verified non-vacuous by mutation: adding a `fallback()` to
    ///      GuardedAccount makes this test fail. What it does NOT cover is a
    ///      newly added named function — random bytes will never land on a
    ///      specific 4-byte selector. `testFuzz_GuardianCannotCallAnyDeclaredFunction`
    ///      covers that half.
    function testFuzz_GuardianCannotCallAnythingExceptRevoke(bytes calldata data) public {
        vm.assume(data.length >= 4);
        bytes4 selector = bytes4(data[:4]);
        vm.assume(selector != GuardedAccount.revoke.selector);
        vm.assume(selector != OWNER_GETTER);
        vm.assume(selector != GUARDIAN_GETTER);

        uint256 tokensBefore = token.balanceOf(address(account));

        vm.prank(guardian);
        (bool ok,) = address(account).call(data);

        assertFalse(ok, "guardian call other than revoke must revert");
        assertEq(account.owner(), owner, "owner unchanged");
        assertEq(account.guardian(), guardian, "guardian unchanged");
        assertEq(token.balanceOf(address(account)), tokensBefore, "balance unchanged");
    }

    /// @notice The other half of the proof: walk every state-changing function
    ///         GuardedAccount actually declares, by name, with fuzzed arguments,
    ///         and assert the guardian is refused by all of them except `revoke`.
    ///
    ///         ADDING A FUNCTION TO GuardedAccount MEANS ADDING IT HERE. The
    ///         fuzzers above cannot discover a new selector on their own, so this
    ///         list is the thing that keeps the README's claim true over time.
    function testFuzz_GuardianCannotCallAnyDeclaredFunction(
        address target,
        uint256 value,
        bytes calldata data
    ) public {
        bytes[] memory ownerOnly = new bytes[](3);
        ownerOnly[0] = abi.encodeCall(GuardedAccount.execute, (target, value, data));
        ownerOnly[1] = abi.encodeCall(GuardedAccount.setGuardian, (target));
        ownerOnly[2] = abi.encodeCall(GuardedAccount.transferOwnership, (target));

        uint256 tokensBefore = token.balanceOf(address(account));

        for (uint256 i = 0; i < ownerOnly.length; i++) {
            vm.prank(guardian);
            (bool ok,) = address(account).call(ownerOnly[i]);
            assertFalse(ok, "guardian reached a declared owner-only function");
        }

        assertEq(account.owner(), owner, "owner unchanged");
        assertEq(account.guardian(), guardian, "guardian unchanged");
        assertEq(token.balanceOf(address(account)), tokensBefore, "balance unchanged");
    }

    /// @notice Same sweep, with value attached — a guardian cannot buy its way in.
    function testFuzz_GuardianCannotCallWithValue(bytes calldata data, uint96 value) public {
        vm.assume(data.length >= 4);
        bytes4 selector = bytes4(data[:4]);
        vm.assume(selector != GuardedAccount.revoke.selector);
        vm.assume(selector != OWNER_GETTER);
        vm.assume(selector != GUARDIAN_GETTER);
        vm.deal(guardian, value);

        vm.prank(guardian);
        (bool ok,) = address(account).call{value: value}(data);

        assertFalse(ok, "payable guardian call other than revoke must revert");
    }

    // -------------------------------------------------------------------------
    // Positive controls — proves the reverts above come from authorization,
    // not from the calls being broken in the first place.
    // -------------------------------------------------------------------------

    function test_OwnerCanMoveTokens() public {
        vm.prank(owner);
        account.execute(
            address(token), 0, abi.encodeWithSignature("transfer(address,uint256)", owner, BALANCE)
        );
        assertEq(token.balanceOf(owner), BALANCE);
    }

    function test_OwnerCanSweepNativeOKB() public {
        vm.deal(address(account), 5 ether);
        vm.prank(owner);
        account.execute(owner, 5 ether, "");
        assertEq(owner.balance, 5 ether);
    }

    function test_OwnerCanRevokeWithoutGuardian() public {
        vm.prank(owner);
        account.execute(
            address(token), 0, abi.encodeWithSignature("approve(address,uint256)", spender, uint256(0))
        );
        assertEq(token.allowance(address(account), spender), 0);
    }

    function test_OwnerCanChangeGuardian() public {
        vm.prank(owner);
        account.setGuardian(stranger);
        assertEq(account.guardian(), stranger);

        // ...and the old guardian is immediately powerless.
        vm.expectRevert(abi.encodeWithSelector(GuardedAccount.NotGuardian.selector, guardian));
        vm.prank(guardian);
        account.revoke(address(token), spender);
    }

    function test_OwnerCanTransferOwnership() public {
        vm.prank(owner);
        account.transferOwnership(stranger);
        assertEq(account.owner(), stranger);
    }

    function test_RevertWhen_OwnerExecutesFailingCall() public {
        // Bubbled revert, so a failed revoke can never be mistaken for a success.
        vm.prank(owner);
        vm.expectRevert();
        account.execute(address(token), 0, abi.encodeWithSignature("nonexistent()"));
    }

    function test_AccountAcceptsNativeOKB() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool ok,) = address(account).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(account).balance, 1 ether);
    }
}
