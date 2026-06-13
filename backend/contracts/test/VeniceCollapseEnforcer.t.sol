// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/VeniceCollapseEnforcer.sol";

contract VeniceCollapseEnforcerTest is Test {
    VeniceCollapseEnforcer enforcer;
    address initiator = makeAddr("initiator");
    bytes32 constant SESSION = keccak256("test-session-1");

    function setUp() public {
        enforcer = new VeniceCollapseEnforcer();
        vm.prank(initiator);
        enforcer.initSession(SESSION, 3);
    }

    function test_SubmitAndCollapse() public {
        vm.startPrank(initiator);
        enforcer.submitReasoningHash(SESSION, 0, keccak256("A"), 60);
        enforcer.submitReasoningHash(SESSION, 1, keccak256("B"), 87); // winner
        enforcer.submitReasoningHash(SESSION, 2, keccak256("C"), 45);
        vm.stopPrank();

        (,, uint8 winner, bool collapsed,) = enforcer.getSession(SESSION);
        assertTrue(collapsed);
        assertEq(winner, 1); // agent 1 had highest confidence (87)
    }

    function test_BeforeHook_SucceedsForWinner() public {
        vm.startPrank(initiator);
        enforcer.submitReasoningHash(SESSION, 0, keccak256("A"), 60);
        enforcer.submitReasoningHash(SESSION, 1, keccak256("B"), 87);
        enforcer.submitReasoningHash(SESSION, 2, keccak256("C"), 45);
        vm.stopPrank();

        bytes memory terms = abi.encode(SESSION, uint8(1)); // winner is agent 1
        // Should not revert.
        enforcer.beforeHook(terms, "", ModeCode.wrap(0), "", bytes32(0), address(0), address(0));
    }

    function test_BeforeHook_RevertsForLoser() public {
        vm.startPrank(initiator);
        enforcer.submitReasoningHash(SESSION, 0, keccak256("A"), 60);
        enforcer.submitReasoningHash(SESSION, 1, keccak256("B"), 87);
        enforcer.submitReasoningHash(SESSION, 2, keccak256("C"), 45);
        vm.stopPrank();

        bytes memory terms = abi.encode(SESSION, uint8(0)); // loser agent 0
        vm.expectRevert("This agent did not win collapse");
        enforcer.beforeHook(terms, "", ModeCode.wrap(0), "", bytes32(0), address(0), address(0));
    }

    function test_BeforeHook_RevertsBeforeCollapse() public {
        bytes memory terms = abi.encode(SESSION, uint8(0));
        vm.expectRevert("Wavefunction not yet collapsed");
        enforcer.beforeHook(terms, "", ModeCode.wrap(0), "", bytes32(0), address(0), address(0));
    }

    function test_OnlyInitiatorCanSubmitHash() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert("Not session initiator");
        enforcer.submitReasoningHash(SESSION, 0, keccak256("fake"), 99);
    }

    function testFuzz_CollapseAlwaysPicksHighestConfidence(uint8 c0, uint8 c1, uint8 c2) public {
        c0 = uint8(bound(c0, 0, 100));
        c1 = uint8(bound(c1, 0, 100));
        c2 = uint8(bound(c2, 0, 100));

        vm.startPrank(initiator);
        enforcer.submitReasoningHash(SESSION, 0, keccak256("A"), c0);
        enforcer.submitReasoningHash(SESSION, 1, keccak256("B"), c1);
        enforcer.submitReasoningHash(SESSION, 2, keccak256("C"), c2);
        vm.stopPrank();

        (,, uint8 winner,,) = enforcer.getSession(SESSION);

        // Recompute the expected winner with the same tie-break rule the contract uses
        // (strict greater-than => lowest agentId wins ties).
        uint8[3] memory confs = [c0, c1, c2];
        uint8 expectedWinner;
        uint8 highest;
        for (uint8 i = 0; i < 3; i++) {
            if (confs[i] > highest) {
                highest = confs[i];
                expectedWinner = i;
            }
        }
        assertEq(winner, expectedWinner);

        // The winning confidence must equal the maximum submitted confidence.
        uint8 maxConf = c0;
        if (c1 > maxConf) maxConf = c1;
        if (c2 > maxConf) maxConf = c2;
        (, uint8 winnerConf,) = enforcer.getAgentSubmission(SESSION, winner);
        assertEq(winnerConf, maxConf);
    }
}
