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
 * WaveStrategyVault — the Wave Protocol execution layer (AI yield manager).
 *
 * After the agent swarm collapses to a winner, capital lands in this vault (from the user's
 * ERC-7715 delegation redeem, or treasury for the demo). The backend then calls executeStrategy,
 * which:
 *   1. CHECKS the VeniceCollapseEnforcer — refuses to deploy unless the swarm actually collapsed
 *      onchain to the given winner (cryptographically constrained AI — it can't act off-consensus).
 *   2. Skims a protocol fee to the treasury.
 *   3. Supplies the rest to Compound V3 **on behalf of the USER** (supplyTo) — so the USER owns
 *      the cUSDC position and all the yield. They can withdraw from Compound directly, anytime.
 *
 * The vault never keeps the position — it's a constrained router. One vault serves all sessions.
 */
contract WaveStrategyVault {
    /// @notice Compound V3 Comet on Base Sepolia (baseToken = Circle USDC).
    address public immutable comet;
    address public immutable usdc;
    /// @notice VeniceCollapseEnforcer — the onchain consensus the vault is gated by.
    address public immutable enforcer;
    /// @notice Fee recipient + privileged caller (the backend/protocol EOA).
    address public immutable treasury;
    /// @notice Protocol fee in basis points (e.g. 100 = 1%).
    uint16 public immutable feeBps;

    struct ExecutionRecord {
        uint8   winnerAgentId;
        address user;          // who the Compound position was credited to
        uint256 amountUsdc;    // net supplied to Compound (6 dec)
        uint256 feeUsdc;       // protocol fee taken
        bool    executed;
    }

    mapping(bytes32 => ExecutionRecord) public executions;

    event StrategyExecuted(
        bytes32 indexed sessionId,
        uint8   indexed winnerAgentId,
        address indexed user,
        uint256         amountUsdc,
        uint256         feeUsdc,
        address         comet
    );

    error OnlyTreasury();
    error AlreadyExecuted();
    error NoUsdcBalance();
    error NoOnchainConsensus();

    constructor(address _comet, address _usdc, address _enforcer, address _treasury, uint16 _feeBps) {
        comet    = _comet;
        usdc     = _usdc;
        enforcer = _enforcer;
        treasury = _treasury;
        feeBps   = _feeBps;
    }

    modifier onlyTreasury() {
        if (msg.sender != treasury) revert OnlyTreasury();
        _;
    }

    /**
     * Deploy the vault's USDC into Compound V3, credited to `user`.
     * Gated by the enforcer: only runs if the swarm collapsed onchain to `winnerAgentId`.
     */
    function executeStrategy(bytes32 sessionId, uint8 winnerAgentId, address user) external onlyTreasury {
        if (executions[sessionId].executed) revert AlreadyExecuted();

        // Constrained AI — the vault won't move funds unless the onchain collapse agrees.
        (, , uint8 win, bool collapsed, ) = IVeniceEnforcer(enforcer).getSession(sessionId);
        if (!collapsed || win != winnerAgentId) revert NoOnchainConsensus();

        uint256 bal = IERC20(usdc).balanceOf(address(this));
        if (bal == 0) revert NoUsdcBalance();

        uint256 fee = (bal * feeBps) / 10_000;
        uint256 net = bal - fee;

        executions[sessionId] = ExecutionRecord({
            winnerAgentId: winnerAgentId,
            user:          user,
            amountUsdc:    net,
            feeUsdc:       fee,
            executed:      true
        });

        if (fee > 0) IERC20(usdc).transfer(treasury, fee); // protocol fee
        IERC20(usdc).approve(comet, net);
        IComet(comet).supplyTo(user, usdc, net);           // USER owns the Compound position

        emit StrategyExecuted(sessionId, winnerAgentId, user, net, fee, comet);
    }

    /// @notice A user's Compound V3 supply position (cUSDC, base units).
    function userPosition(address user) external view returns (uint256) {
        return IComet(comet).balanceOf(user);
    }

    /// @notice Emergency: treasury recovers any stuck USDC from the vault.
    function recoverUsdc(address to) external onlyTreasury {
        uint256 bal = IERC20(usdc).balanceOf(address(this));
        if (bal == 0) revert NoUsdcBalance();
        IERC20(usdc).transfer(to, bal);
    }
}
