// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/WaveMarket.sol";

contract DeployMarket is Script {
    // Live Base Sepolia deployments.
    address constant COMET    = 0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017; // Compound V3 (baseToken = USDC)
    address constant USDC     = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant ENFORCER = 0x3ec6F2c470e57f487709b153f77c02851fe864C5; // VeniceCollapseEnforcer

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address relayer = vm.addr(deployerKey); // privileged caller = backend EOA

        vm.startBroadcast(deployerKey);
        WaveMarket market = new WaveMarket(COMET, USDC, ENFORCER, relayer);
        vm.stopBroadcast();

        console.log("WaveMarket deployed at:", address(market));
        console.log("  comet   :", COMET);
        console.log("  usdc    :", USDC);
        console.log("  enforcer:", ENFORCER);
        console.log("  relayer :", relayer);
        console.log("Set in backend/.env.local:  WAVE_MARKET_ADDRESS=", address(market));
    }
}
