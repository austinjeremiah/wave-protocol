// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/WaveMarket.sol";

/**
 * Fork test against Base Sepolia — REAL VeniceCollapseEnforcer, REAL Compound V3, REAL USDC.
 * No mocks: drives the live enforcer to actually collapse a fresh session, lists the winning
 * strategy, then re-executes it for a BUYER and verifies the buyer receives a real Compound
 * position. Provenance gating is checked against true onchain state.
 *
 * Run: forge test --match-contract WaveMarketFork --fork-url $BASE_SEPOLIA_RPC_URL -vvv
 */
interface IEnforcer {
    function initSession(bytes32 sessionId, uint8 agentCount) external;
    function submitReasoningHash(bytes32 sessionId, uint8 agentId, bytes32 reasoningHash, uint8 confidence) external;
}

interface IUSDC {
    function balanceOf(address) external view returns (uint256);
}

contract WaveMarketFork is Test {
    // Live Base Sepolia deployments.
    address constant COMET    = 0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017; // Compound V3 (cUSDCv3)
    address constant USDC     = 0x036CbD53842c5426634e7929541eC2318f3dCF7e; // Circle USDC
    address constant ENFORCER = 0x3ec6F2c470e57f487709b153f77c02851fe864C5; // VeniceCollapseEnforcer

    WaveMarket market;
    bytes32 sessionId = keccak256("wave-market-fork-test-v1");
    bytes32 reasoningHash = keccak256("r0");
    uint256 constant TWO_USDC = 2_000_000; // 6 decimals
    uint256 constant PRICE    = 500_000;   // 0.5 USDC strategy fee (paid off-contract via x402)
    address constant SELLER   = address(0x5E11E2);
    address constant BUYER    = address(0xB47E2);

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        require(bytes(rpc).length > 0, "set BASE_SEPOLIA_RPC_URL for the fork test");
        vm.createSelectFork(rpc);

        // relayer = this test contract (deploys the market and is the privileged caller).
        market = new WaveMarket(COMET, USDC, ENFORCER, address(this));

        // Drive the REAL enforcer to collapse a fresh session: agent 0 wins (highest confidence).
        IEnforcer(ENFORCER).initSession(sessionId, 3);
        IEnforcer(ENFORCER).submitReasoningHash(sessionId, 0, reasoningHash, 90);
        IEnforcer(ENFORCER).submitReasoningHash(sessionId, 1, keccak256("r1"), 80);
        IEnforcer(ENFORCER).submitReasoningHash(sessionId, 2, keccak256("r2"), 70); // 3rd submit auto-collapses
    }

    function test_List_Then_PurchaseAndExecute_CreditsBuyer() public {
        // List the proven winning strategy.
        uint256 id = market.list(sessionId, 0, reasoningHash, SELLER, PRICE);
        assertEq(id, 0, "first listing id");

        // The buyer's deploy capital is funded into the market (backend does this after x402).
        deal(USDC, address(market), TWO_USDC);

        uint256 buyerPosBefore = IUSDC(COMET).balanceOf(BUYER);
        market.purchaseAndExecute(id, BUYER);

        // BUYER owns the new Compound V3 position (credited via supplyTo).
        assertGt(IUSDC(COMET).balanceOf(BUYER) - buyerPosBefore, 0, "buyer should own a Compound position");
        // Market holds no USDC afterward (full balance supplied).
        assertEq(IUSDC(USDC).balanceOf(address(market)), 0, "market drained");

        (, , , , , uint256 purchases, bool active) = market.listings(id);
        assertEq(purchases, 1, "purchase counted");
        assertTrue(active, "still active");
    }

    function test_List_RevertsOnWrongWinner() public {
        // Real winner is agent 0; claiming agent 1 must be rejected by the enforcer gate.
        vm.expectRevert(WaveMarket.NotProvenWinner.selector);
        market.list(sessionId, 1, reasoningHash, SELLER, PRICE);
    }

    function test_List_RevertsForNonRelayer() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(WaveMarket.OnlyRelayer.selector);
        market.list(sessionId, 0, reasoningHash, SELLER, PRICE);
    }

    function test_Purchase_RevertsForNonRelayer() public {
        uint256 id = market.list(sessionId, 0, reasoningHash, SELLER, PRICE);
        deal(USDC, address(market), TWO_USDC);
        vm.prank(address(0xBEEF));
        vm.expectRevert(WaveMarket.OnlyRelayer.selector);
        market.purchaseAndExecute(id, BUYER);
    }

    function test_Purchase_RevertsOnInactiveListing() public {
        uint256 id = market.list(sessionId, 0, reasoningHash, SELLER, PRICE);
        market.deactivate(id);
        deal(USDC, address(market), TWO_USDC);
        vm.expectRevert(WaveMarket.InactiveListing.selector);
        market.purchaseAndExecute(id, BUYER);
    }

    function test_Purchase_RevertsWithNoCapital() public {
        uint256 id = market.list(sessionId, 0, reasoningHash, SELLER, PRICE);
        // No funding — nothing to deploy.
        vm.expectRevert(WaveMarket.NoCapital.selector);
        market.purchaseAndExecute(id, BUYER);
    }

    function test_PurchaseTwice_CreditsBuyerEachTime() public {
        uint256 id = market.list(sessionId, 0, reasoningHash, SELLER, PRICE);

        deal(USDC, address(market), TWO_USDC);
        market.purchaseAndExecute(id, BUYER);

        deal(USDC, address(market), TWO_USDC);
        uint256 mid = IUSDC(COMET).balanceOf(BUYER);
        market.purchaseAndExecute(id, BUYER);

        assertGt(IUSDC(COMET).balanceOf(BUYER) - mid, 0, "second purchase credits buyer again");
        (, , , , , uint256 purchases, ) = market.listings(id);
        assertEq(purchases, 2, "two purchases counted");
    }
}
