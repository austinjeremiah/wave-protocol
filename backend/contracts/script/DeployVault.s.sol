// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/WaveStrategyVault.sol";

contract DeployVault is Script {
    // Live Base Sepolia deployments.
    address constant COMET    = 0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017; // Compound V3 (baseToken = USDC)
    address constant USDC     = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant ENFORCER = 0x3ec6F2c470e57f487709b153f77c02851fe864C5; // VeniceCollapseEnforcer
    uint16  constant FEE_BPS  = 100; // 1% protocol fee

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasury = vm.addr(deployerKey); // fee recipient + privileged caller = backend EOA

        vm.startBroadcast(deployerKey);
        WaveStrategyVault vault = new WaveStrategyVault(COMET, USDC, ENFORCER, treasury, FEE_BPS);
        vm.stopBroadcast();

        console.log("WaveStrategyVault deployed at:", address(vault));
        console.log("  comet   :", COMET);
        console.log("  usdc    :", USDC);
        console.log("  enforcer:", ENFORCER);
        console.log("  treasury:", treasury);
        console.log("  feeBps  :", FEE_BPS);
        console.log("Set in backend/.env.local:  WAVE_STRATEGY_VAULT_ADDRESS=", address(vault));
    }
}
