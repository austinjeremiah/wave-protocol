// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IComet {
    /// @notice Supply an asset to Compound V3 on behalf of `dst` (credits dst's position).
    function supplyTo(address dst, address asset, uint256 amount) external;
    /// @notice Base token (USDC) supply balance of an account in the protocol.
    function balanceOf(address account) external view returns (uint256);
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IVeniceEnforcer {
    /// @notice Onchain collapse state for a session (from VeniceCollapseEnforcer).
    function getSession(bytes32 sessionId)
        external
        view
        returns (uint8 submissionCount, uint8 requiredAgents, uint8 winnerAgentId, bool collapsed, address initiator);
}

/**
 * WaveMarket — a copy-trading marketplace for PROVEN strategies (additive layer).
 *
 * After a Wave session collapses onchain (VeniceCollapseEnforcer), its owner can list the
 * winning strategy here. A buyer pays the SELLER off-contract via x402 (a real USDC sale on
 * the buyer's signed EIP-3009 authorization), and the backend then re-executes that proven
 * strategy for the BUYER's own capital — supplying it to Compound V3, credited to the buyer.
 *
 * The contract does ONE job: re-deploy a buyer's capital, but only for a strategy whose
 * onchain consensus is still verifiably true. It reads the enforcer (never writes it) and
 * touches none of the existing debate / vault / delegation machinery.
 *
 *   list(...)               — record a listing, but ONLY if the enforcer confirms that session
 *                             collapsed to the claimed winner (provenance).
 *   purchaseAndExecute(...) — re-verify provenance, then supplyTo(buyer) on Compound with the
 *                             capital the contract is holding for this purchase.
 *
 * The seller's strategy fee is paid by x402 (buyer -> seller), NOT by this contract — keeping
 * x402 as the marketplace's sale rail and this contract as a pure, gated capital router.
 */
contract WaveMarket {
    /// @notice Compound V3 Comet on Base Sepolia (baseToken = Circle USDC).
    address public immutable comet;
    address public immutable usdc;
    /// @notice VeniceCollapseEnforcer — the onchain consensus every listing is proven against.
    address public immutable enforcer;
    /// @notice Privileged caller (the backend/protocol relayer EOA).
    address public immutable relayer;

    struct Listing {
        bytes32 originalSessionId; // the collapsed session this strategy came from
        uint8   winnerAgentId;     // the winning lens
        bytes32 reasoningHash;     // the proven reasoning, committed onchain at collapse
        address seller;            // who listed it (the original session owner)
        uint256 priceUsdc;         // strategy fee per purchase (paid to seller via x402) — informational
        uint256 purchases;         // how many times this strategy has been bought + re-executed
        bool    active;
    }

    mapping(uint256 => Listing) public listings;
    uint256 public listingCount;

    event StrategyListed(
        uint256 indexed listingId,
        bytes32 indexed originalSessionId,
        address indexed seller,
        uint8           winnerAgentId,
        bytes32         reasoningHash,
        uint256         priceUsdc
    );
    event StrategyPurchased(
        uint256 indexed listingId,
        address indexed buyer,
        uint256         deployedUsdc,
        address         comet
    );
    event ListingDeactivated(uint256 indexed listingId);

    error OnlyRelayer();
    error NotProvenWinner();
    error InactiveListing();
    error NoCapital();

    constructor(address _comet, address _usdc, address _enforcer, address _relayer) {
        comet    = _comet;
        usdc     = _usdc;
        enforcer = _enforcer;
        relayer  = _relayer;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert OnlyRelayer();
        _;
    }

    /**
     * List a winning strategy. Reverts unless the enforcer confirms `sessionId` collapsed
     * onchain to `winnerAgentId` — you can only sell a strategy that genuinely reached consensus.
     */
    function list(
        bytes32 sessionId,
        uint8 winnerAgentId,
        bytes32 reasoningHash,
        address seller,
        uint256 priceUsdc
    ) external onlyRelayer returns (uint256 id) {
        (, , uint8 win, bool collapsed, ) = IVeniceEnforcer(enforcer).getSession(sessionId);
        if (!collapsed || win != winnerAgentId) revert NotProvenWinner();

        id = listingCount++;
        listings[id] = Listing({
            originalSessionId: sessionId,
            winnerAgentId:     winnerAgentId,
            reasoningHash:     reasoningHash,
            seller:            seller,
            priceUsdc:         priceUsdc,
            purchases:         0,
            active:            true
        });

        emit StrategyListed(id, sessionId, seller, winnerAgentId, reasoningHash, priceUsdc);
    }

    /**
     * Re-execute a listed strategy for `buyer`. The contract must already hold the buyer's
     * deploy capital (funded by the backend just before this call). Re-verifies provenance,
     * then supplies the full balance to Compound V3 credited to the buyer.
     */
    function purchaseAndExecute(uint256 id, address buyer) external onlyRelayer {
        Listing storage l = listings[id];
        if (!l.active) revert InactiveListing();

        // Re-verify at execution time — consensus must still be onchain-true.
        (, , uint8 win, bool collapsed, ) = IVeniceEnforcer(enforcer).getSession(l.originalSessionId);
        if (!collapsed || win != l.winnerAgentId) revert NotProvenWinner();

        uint256 bal = IERC20(usdc).balanceOf(address(this));
        if (bal == 0) revert NoCapital();

        IERC20(usdc).approve(comet, bal);
        IComet(comet).supplyTo(buyer, usdc, bal); // BUYER owns the new Compound position
        l.purchases++;

        emit StrategyPurchased(id, buyer, bal, comet);
    }

    /// @notice Seller (via relayer) can delist a strategy.
    function deactivate(uint256 id) external onlyRelayer {
        listings[id].active = false;
        emit ListingDeactivated(id);
    }

    /// @notice A buyer's Compound V3 supply position (cUSDC, base units).
    function position(address account) external view returns (uint256) {
        return IComet(comet).balanceOf(account);
    }

    /// @notice Emergency: relayer recovers any stuck USDC (e.g. a purchase that aborted post-funding).
    function recoverUsdc(address to) external onlyRelayer {
        uint256 bal = IERC20(usdc).balanceOf(address(this));
        if (bal == 0) revert NoCapital();
        IERC20(usdc).transfer(to, bal);
    }
}
