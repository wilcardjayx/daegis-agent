// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test} from "forge-std/Test.sol";
import {DrainerSpender, RouterSpender} from "./mocks/Spenders.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Substantiates the Phase 3 demo props: the drainer really drains, and
///         the router really cannot touch a third party's funds. These are the
///         two behaviours the LLM verdict has to tell apart despite both holding
///         an identical unlimited approval.
contract SpendersTest is Test {
    MockERC20 internal token;
    DrainerSpender internal drainer;
    RouterSpender internal router;

    address internal victim = makeAddr("victim");
    address internal attacker = makeAddr("attacker");
    address internal randomCaller = makeAddr("randomCaller");

    uint256 internal constant BALANCE = 1_000e18;

    function setUp() public {
        token = new MockERC20();
        drainer = new DrainerSpender(attacker);
        router = new RouterSpender();
        token.mint(victim, BALANCE);
    }

    // --- The hostile one is genuinely hostile ---

    function test_DrainerSweepsVictimToAttacker() public {
        // Victim grants the unlimited approval the heuristic would flag.
        vm.prank(victim);
        token.approve(address(drainer), type(uint256).max);

        // Anyone — not the victim — can now trigger the sweep.
        vm.prank(randomCaller);
        drainer.claim(address(token), victim);

        assertEq(token.balanceOf(victim), 0, "victim drained");
        assertEq(token.balanceOf(attacker), BALANCE, "attacker received everything");
    }

    // --- The benign one is structurally safe with the SAME approval ---

    function test_RouterPullsOnlyCallersOwnTokens() public {
        vm.prank(victim);
        token.approve(address(router), type(uint256).max);

        // A third party cannot use the victim's approval to move the victim's
        // tokens: swap always transferFrom(msg.sender), so randomCaller only
        // spends its own (zero) balance.
        vm.prank(randomCaller);
        vm.expectRevert(); // randomCaller has no balance to pull
        router.swap(address(token), BALANCE);

        assertEq(token.balanceOf(victim), BALANCE, "victim untouched by a third party");
    }

    function test_RouterLegitimatelyPullsTheTradersOwnTokens() public {
        vm.prank(victim);
        token.approve(address(router), type(uint256).max);

        // The victim calling their own swap works — this is the legitimate use
        // that makes the unlimited approval necessary and benign.
        vm.prank(victim);
        router.swap(address(token), 100e18);

        assertEq(token.balanceOf(victim), BALANCE - 100e18);
        assertEq(token.balanceOf(address(router)), 100e18);
    }
}
