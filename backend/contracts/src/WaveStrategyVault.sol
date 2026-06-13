// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IComet {
    /// @notice Supply an asset to Compound V3.
    function supply(address asset, uint256 amount) external;
    /// @notice Base token (USDC) balance of an account in the protocol.
    function balanceOf(address account) external view returns (uint256);
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * WaveStrategyVault — the Wave Protocol execution layer.
 *
 * Two-tx execution proof (both visible on Basescan):
 *   tx1: USDC.transfer(vault, amount)       — winner's ERC-7715 delegation redeemed;
 *                                              VeniceCollapseEnforcer blocks any loser.
 *   tx2: vault.executeStrategy(session, id) — backend calls this; vault approves + supplies
 *                                              all received USDC to Compound V3 (cUSDCv3)
 *                                              on Base Sepolia, earning real yield.
 *
 * The vault is owned by the backend EOA. One vault serves all sessions.
 */
contract WaveStrategyVault {
    /// @notice Compound V3 Comet on Base Sepolia (baseToken = Circle USDC).
    address public immutable comet;
    address public immutable usdc;
    address public immutable owner;

    struct ExecutionRecord {
        uint8   winnerAgentId;
        uint256 amountUsdc;   // amount supplied to Compound (6 dec)
        bool    executed;
    }

    mapping(bytes32 => ExecutionRecord) public executions;

    event StrategyExecuted(
        bytes32 indexed sessionId,
        uint8   indexed winnerAgentId,
        uint256         amountUsdc,
        address         comet
    );

    error OnlyOwner();
    error AlreadyExecuted();
    error NoUsdcBalance();

    constructor(address _comet, address _usdc) {
        comet  = _comet;
        usdc   = _usdc;
        owner  = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    /**
     * Step 2: called by backend after USDC lands here from the delegation redeem.
     * Approves and supplies the full USDC balance to Compound V3, minting cUSDC to vault.
     * The cUSDC (Compound supply position) earns yield automatically.
     */
    function executeStrategy(bytes32 sessionId, uint8 winnerAgentId) external onlyOwner {
        if (executions[sessionId].executed) revert AlreadyExecuted();

        uint256 bal = IERC20(usdc).balanceOf(address(this));
        if (bal == 0) revert NoUsdcBalance();

        executions[sessionId] = ExecutionRecord({
            winnerAgentId: winnerAgentId,
            amountUsdc:    bal,
            executed:      true
        });

        IERC20(usdc).approve(comet, bal);
        IComet(comet).supply(usdc, bal);

        emit StrategyExecuted(sessionId, winnerAgentId, bal, comet);
    }

    /// @notice Compound V3 supply position balance (cUSDC) held by this vault.
    function strategyBalance() external view returns (uint256) {
        return IComet(comet).balanceOf(address(this));
    }

    /// @notice Emergency withdrawal — owner recovers USDC if supply fails.
    function recoverUsdc(address to) external onlyOwner {
        uint256 bal = IERC20(usdc).balanceOf(address(this));
        if (bal == 0) revert NoUsdcBalance();
        IERC20(usdc).transfer(to, bal);
    }
}
