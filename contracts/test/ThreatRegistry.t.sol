// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test} from "forge-std/Test.sol";
import {ThreatRegistry} from "../src/ThreatRegistry.sol";

contract ThreatRegistryTest is Test {
    ThreatRegistry internal registry;

    address internal deployer = address(this);
    address internal agent = makeAddr("agent");
    address internal newAgent = makeAddr("newAgent");
    address internal stranger = makeAddr("stranger");
    address internal spender = makeAddr("maliciousSpender");

    bytes32 internal constant REASON = keccak256("approve-then-drain, unverified proxy");

    event SpenderFlagged(
        address indexed spender, uint8 riskScore, bytes32 reasonHash, uint256 flaggedAt
    );
    event AgentUpdated(address indexed previousAgent, address indexed newAgent);

    function setUp() public {
        registry = new ThreatRegistry(agent);
    }

    // -------------------------------------------------------------------------
    // Construction
    // -------------------------------------------------------------------------

    function test_ConstructorSetsRoles() public view {
        assertEq(registry.owner(), deployer);
        assertEq(registry.agent(), agent);
    }

    function test_RevertWhen_ConstructedWithZeroAgent() public {
        vm.expectRevert(ThreatRegistry.ZeroAddress.selector);
        new ThreatRegistry(address(0));
    }

    // -------------------------------------------------------------------------
    // Recording verdicts
    // -------------------------------------------------------------------------

    function test_AgentCanRecord() public {
        vm.expectEmit(true, true, true, true);
        emit SpenderFlagged(spender, 92, REASON, block.timestamp);

        vm.prank(agent);
        registry.record(spender, 92, REASON);

        (bool flagged, uint8 risk, bytes32 reason) = registry.isFlagged(spender);
        assertTrue(flagged);
        assertEq(risk, 92);
        assertEq(reason, REASON);
    }

    function test_UnknownSpenderIsNotFlagged() public view {
        (bool flagged, uint8 risk, bytes32 reason) = registry.isFlagged(stranger);
        assertFalse(flagged);
        assertEq(risk, 0);
        assertEq(reason, bytes32(0));
    }

    function test_ZeroRiskScoreStillCountsAsAssessed() public {
        // "The agent looked and found nothing" must be distinguishable from
        // "the agent never looked" — otherwise the public page cannot tell a
        // clean spender from an unknown one.
        vm.prank(agent);
        registry.record(spender, 0, REASON);

        (bool flagged, uint8 risk,) = registry.isFlagged(spender);
        assertTrue(flagged, "a zero-risk verdict is still a verdict");
        assertEq(risk, 0);
    }

    function test_RecordOverwritesPreviousVerdict() public {
        vm.startPrank(agent);
        registry.record(spender, 40, keccak256("first pass"));
        skip(1 hours);
        registry.record(spender, 95, REASON);
        vm.stopPrank();

        (, uint8 risk, bytes32 reason) = registry.isFlagged(spender);
        assertEq(risk, 95);
        assertEq(reason, REASON);

        (,uint40 flaggedAt,) = registry.verdicts(spender);
        assertEq(flaggedAt, uint40(block.timestamp), "timestamp tracks the latest verdict");
    }

    function test_VerdictsGetterExposesTimestamp() public {
        vm.prank(agent);
        registry.record(spender, 77, REASON);

        (uint8 risk, uint40 flaggedAt, bytes32 reason) = registry.verdicts(spender);
        assertEq(risk, 77);
        assertEq(flaggedAt, uint40(block.timestamp));
        assertEq(reason, REASON);
    }

    function test_RevertWhen_NonAgentRecords() public {
        vm.expectRevert(abi.encodeWithSelector(ThreatRegistry.NotAgent.selector, stranger));
        vm.prank(stranger);
        registry.record(spender, 90, REASON);
    }

    function test_RevertWhen_OwnerRecords() public {
        // The owner rotates keys; it does not get to author verdicts. Keeps the
        // registry's write path attributable to exactly one agent key.
        vm.expectRevert(abi.encodeWithSelector(ThreatRegistry.NotAgent.selector, deployer));
        registry.record(spender, 90, REASON);
    }

    function test_RevertWhen_RecordingZeroSpender() public {
        vm.expectRevert(ThreatRegistry.ZeroAddress.selector);
        vm.prank(agent);
        registry.record(address(0), 90, REASON);
    }

    function test_RevertWhen_RiskScoreAboveMax() public {
        vm.expectRevert(abi.encodeWithSelector(ThreatRegistry.InvalidRiskScore.selector, uint8(101)));
        vm.prank(agent);
        registry.record(spender, 101, REASON);
    }

    function testFuzz_RecordRoundTrips(address s, uint8 risk, bytes32 reason) public {
        vm.assume(s != address(0));
        risk = uint8(bound(risk, 0, registry.MAX_RISK_SCORE()));

        vm.prank(agent);
        registry.record(s, risk, reason);

        (bool flagged, uint8 gotRisk, bytes32 gotReason) = registry.isFlagged(s);
        assertTrue(flagged);
        assertEq(gotRisk, risk);
        assertEq(gotReason, reason);
    }

    function testFuzz_RevertWhen_AnyNonAgentRecords(address caller) public {
        vm.assume(caller != agent);
        vm.expectRevert(abi.encodeWithSelector(ThreatRegistry.NotAgent.selector, caller));
        vm.prank(caller);
        registry.record(spender, 90, REASON);
    }

    // -------------------------------------------------------------------------
    // Key rotation
    // -------------------------------------------------------------------------

    function test_OwnerCanRotateAgent() public {
        vm.expectEmit(true, true, true, true);
        emit AgentUpdated(agent, newAgent);
        registry.setAgent(newAgent);
        assertEq(registry.agent(), newAgent);

        vm.prank(newAgent);
        registry.record(spender, 88, REASON);
        (bool flagged,,) = registry.isFlagged(spender);
        assertTrue(flagged);
    }

    function test_RotatedOutAgentLosesWriteAccess() public {
        registry.setAgent(newAgent);

        vm.expectRevert(abi.encodeWithSelector(ThreatRegistry.NotAgent.selector, agent));
        vm.prank(agent);
        registry.record(spender, 90, REASON);
    }

    function test_RevertWhen_NonOwnerRotatesAgent() public {
        vm.expectRevert(abi.encodeWithSelector(ThreatRegistry.NotOwner.selector, stranger));
        vm.prank(stranger);
        registry.setAgent(newAgent);
    }

    function test_RevertWhen_AgentRotatesItself() public {
        vm.expectRevert(abi.encodeWithSelector(ThreatRegistry.NotOwner.selector, agent));
        vm.prank(agent);
        registry.setAgent(stranger);
    }

    function test_RevertWhen_RotatingToZeroAgent() public {
        vm.expectRevert(ThreatRegistry.ZeroAddress.selector);
        registry.setAgent(address(0));
    }

    function test_OwnerCanTransferOwnership() public {
        registry.transferOwnership(stranger);
        assertEq(registry.owner(), stranger);

        vm.expectRevert(abi.encodeWithSelector(ThreatRegistry.NotOwner.selector, deployer));
        registry.setAgent(newAgent);
    }

    function test_RevertWhen_NonOwnerTransfersOwnership() public {
        vm.expectRevert(abi.encodeWithSelector(ThreatRegistry.NotOwner.selector, stranger));
        vm.prank(stranger);
        registry.transferOwnership(stranger);
    }
}
