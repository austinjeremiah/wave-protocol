// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/WaveStrategyVault.sol";

/**
 * Fork test against Base Sepolia — REAL VeniceCollapseEnforcer, REAL Compound V3, REAL USDC.
 * No mocks: the test drives the live enforcer to actually collapse a fresh session, then runs
 * the vault against that real onchain consensus and verifies the USER receives the Compound
 * position and the treasury receives the fee.
 *
 * Run: forge test --match-contract WaveStrategyVaultFork --fork-url $BASE_SEPOLIA_RPC_URL -vvv
 */
interface IEnforcer {
    function initSession(bytes32 sessionId, uint8 agentCount) external;
    function submitReasoningHash(bytes32 sessionId, uint8 agentId, bytes32 reasoningHash, uint8 confidence) external;
}

interface IUSDC {
    function balanceOf(address) external view returns (uint256);
}

contract WaveStrategyVaultFork is Test {
    // Live Base Sepolia deployments.
    address constant COMET    = 0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017; // Compound V3 (cUSDCv3)
    address constant USDC     = 0x036CbD53842c5426634e7929541eC2318f3dCF7e; // Circle USDC
    address constant ENFORCER = 0x3ec6F2c470e57f487709b153f77c02851fe864C5; // VeniceCollapseEnforcer

    WaveStrategyVault vault;
    bytes32 sessionId = keccak256("wave-strategy-vault-fork-test-v2");
    uint256 constant ONE_USDC = 1_000_000; // 6 decimals
    uint16  constant FEE_BPS  = 100;       // 1%
    address constant USER     = address(0xA11CE);

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        require(bytes(rpc).length > 0, "set BASE_SEPOLIA_RPC_URL for the fork test");
        vm.createSelectFork(rpc);

        // treasury = this test contract (it deploys the vault and is the privileged caller).
        vault = new WaveStrategyVault(COMET, USDC, ENFORCER, address(this), FEE_BPS);

        // Drive the REAL enforcer to collapse a fresh session: agent 0 wins (highest confidence).
        IEnforcer(ENFORCER).initSession(sessionId, 3);
        IEnforcer(ENFORCER).submitReasoningHash(sessionId, 0, keccak256("r0"), 90);
        IEnforcer(ENFORCER).submitReasoningHash(sessionId, 1, keccak256("r1"), 80);
        IEnforcer(ENFORCER).submitReasoningHash(sessionId, 2, keccak256("r2"), 70); // 3rd submit auto-collapses
    }

    function test_ExecuteStrategy_CreditsUser_AndTakesFee() public {
        deal(USDC, address(vault), ONE_USDC);

        uint256 userPosBefore = IUSDC(COMET).balanceOf(USER);
        uint256 treasuryBefore = IUSDC(USDC).balanceOf(address(this));

        vault.executeStrategy(sessionId, 0, USER);

        uint256 fee = (ONE_USDC * FEE_BPS) / 10_000; // 0.01 USDC
        uint256 net = ONE_USDC - fee;                // 0.99 USDC

        // USER owns the Compound V3 position (credited via supplyTo).
        assertGt(IUSDC(COMET).balanceOf(USER) - userPosBefore, 0, "user should own a Compound position");
        // Treasury received the protocol fee.
        assertEq(IUSDC(USDC).balanceOf(address(this)) - treasuryBefore, fee, "treasury fee");
        // Vault holds no USDC afterward (fee skimmed + net supplied).
        assertEq(IUSDC(USDC).balanceOf(address(vault)), 0, "vault drained");

        (uint8 winner, address user, uint256 amt, uint256 feeRec, bool executed) = vault.executions(sessionId);
        assertEq(winner, 0);
        assertEq(user, USER);
        assertEq(amt, net);
        assertEq(feeRec, fee);
        assertTrue(executed);
    }

    function test_ExecuteStrategy_RevertsOnWrongWinner() public {
        deal(USDC, address(vault), ONE_USDC);
        // Real winner is agent 0; passing agent 1 must be rejected by the enforcer gate.
        vm.expectRevert(WaveStrategyVault.NoOnchainConsensus.selector);
        vault.executeStrategy(sessionId, 1, USER);
    }

    function test_ExecuteStrategy_RevertsForNonTreasury() public {
        deal(USDC, address(vault), ONE_USDC);
        vm.prank(address(0xBEEF));
        vm.expectRevert(WaveStrategyVault.OnlyTreasury.selector);
        vault.executeStrategy(sessionId, 0, USER);
    }

    function test_ExecuteStrategy_RevertsIfAlreadyExecuted() public {
        deal(USDC, address(vault), ONE_USDC);
        vault.executeStrategy(sessionId, 0, USER);
        deal(USDC, address(vault), ONE_USDC);
        vm.expectRevert(WaveStrategyVault.AlreadyExecuted.selector);
        vault.executeStrategy(sessionId, 0, USER);
    }

    function test_RecoverUsdc() public {
        deal(USDC, address(vault), ONE_USDC);
        address to = address(0xCAFE);
        uint256 before = IUSDC(USDC).balanceOf(to);
        vault.recoverUsdc(to);
        assertEq(IUSDC(USDC).balanceOf(to) - before, ONE_USDC);
    }
}
