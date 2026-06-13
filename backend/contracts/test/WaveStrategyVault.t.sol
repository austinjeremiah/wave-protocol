// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/WaveStrategyVault.sol";

/**
 * Fork test against Base Sepolia — real Compound V3 (cUSDCv3) + real Circle USDC.
 * Requires BASE_SEPOLIA_RPC_URL env var. Run with:
 *   forge test --match-contract WaveStrategyVaultFork --fork-url $BASE_SEPOLIA_RPC_URL -vvv
 */
contract WaveStrategyVaultFork is Test {
    // Compound V3 Comet on Base Sepolia (baseToken = Circle USDC).
    address constant COMET = 0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017;
    // Circle testnet USDC on Base Sepolia.
    address constant USDC  = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    WaveStrategyVault vault;
    bytes32 constant SESSION = keccak256("test-session-1");
    uint256 constant ONE_USDC = 1_000_000; // 6 decimals

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length > 0) {
            vm.createSelectFork(rpc);
        }
        vault = new WaveStrategyVault(COMET, USDC);
        // Give the vault 1 USDC from the token contract itself (deal works on ERC-20).
        deal(USDC, address(vault), ONE_USDC);
        assertEq(IERC20(USDC).balanceOf(address(vault)), ONE_USDC, "deal failed");
    }

    function test_ExecuteStrategy_SuppliesUsdcToCompound() public {
        vm.expectEmit(true, true, false, true, address(vault));
        emit WaveStrategyVault.StrategyExecuted(SESSION, 0, ONE_USDC, COMET);

        vault.executeStrategy(SESSION, 0);

        // After supply, USDC balance in vault should be 0.
        assertEq(IERC20(USDC).balanceOf(address(vault)), 0, "USDC should be 0 post-supply");

        // Compound V3 position should reflect the supply (cUSDC balance > 0).
        uint256 pos = vault.strategyBalance();
        assertGt(pos, 0, "Compound position should be > 0");

        // Execution record stored correctly.
        (uint8 winner, uint256 amt, bool executed) = vault.executions(SESSION);
        assertEq(winner, 0);
        assertEq(amt, ONE_USDC);
        assertTrue(executed);
    }

    function test_ExecuteStrategy_RevertsIfNoUsdc() public {
        // Deploy a fresh vault with no balance.
        WaveStrategyVault empty = new WaveStrategyVault(COMET, USDC);
        vm.expectRevert(WaveStrategyVault.NoUsdcBalance.selector);
        empty.executeStrategy(SESSION, 0);
    }

    function test_ExecuteStrategy_RevertsIfAlreadyExecuted() public {
        vault.executeStrategy(SESSION, 0);
        deal(USDC, address(vault), ONE_USDC); // give more USDC
        vm.expectRevert(WaveStrategyVault.AlreadyExecuted.selector);
        vault.executeStrategy(SESSION, 0);
    }

    function test_ExecuteStrategy_RevertsForNonOwner() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(WaveStrategyVault.OnlyOwner.selector);
        vault.executeStrategy(SESSION, 0);
    }

    function test_RecoverUsdc() public {
        address recipient = address(0xABCD);
        uint256 before = IERC20(USDC).balanceOf(recipient);
        vault.recoverUsdc(recipient);
        assertEq(IERC20(USDC).balanceOf(recipient), before + ONE_USDC);
        assertEq(IERC20(USDC).balanceOf(address(vault)), 0);
    }
}

