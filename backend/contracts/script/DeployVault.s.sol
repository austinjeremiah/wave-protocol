// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/WaveStrategyVault.sol";

contract DeployVault is Script {
    // Compound V3 Comet on Base Sepolia (baseToken = Circle USDC 0x036C...).
    address constant COMET = 0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017;
    address constant USDC  = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        WaveStrategyVault vault = new WaveStrategyVault(COMET, USDC);
        console.log("WaveStrategyVault deployed at:", address(vault));
        console.log("  comet (Compound V3 Base Sepolia):", COMET);
        console.log("  usdc:", USDC);
        console.log("Add to backend/.env.local:");
        console.log("  WAVE_STRATEGY_VAULT_ADDRESS=", address(vault));
        vm.stopBroadcast();
    }
}
