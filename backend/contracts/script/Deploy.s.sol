// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/VeniceCollapseEnforcer.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        VeniceCollapseEnforcer enforcer = new VeniceCollapseEnforcer();
        console.log("VeniceCollapseEnforcer deployed at:", address(enforcer));
        vm.stopBroadcast();
    }
}
