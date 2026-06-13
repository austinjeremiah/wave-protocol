// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/WaveStrategyVault.sol";

interface IERC20Test {
    function transfer(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/**
 * One-shot live proof: backend EOA funds the vault with 0.05 USDC, then the vault supplies
 * it to Compound V3 on Base Sepolia. Demonstrates the real treasury → vault → Compound path.
 */
contract TestVaultExecution is Script {
    address constant VAULT = 0xaFD8FC39c170a8c978fbe7Ca705e711249771843;
    address constant USDC  = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        bytes32 sessionId = keccak256(abi.encodePacked("live-proof", block.timestamp));

        vm.startBroadcast(key);
        IERC20Test(USDC).transfer(VAULT, 50_000); // 0.05 USDC
        WaveStrategyVault(VAULT).executeStrategy(sessionId, 0);
        vm.stopBroadcast();

        uint256 pos = WaveStrategyVault(VAULT).strategyBalance();
        console.log("Compound V3 position (cUSDC base units):", pos);
        console.log("Session:", vm.toString(sessionId));
    }
}
