// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @dev Mirror of `delegation-framework/src/utils/Types.sol` ModeCode (ERC-7579 mode).
 *      It is a `bytes32` user-defined value type. Declared locally so this enforcer is
 *      dependency-free (only forge-std for tests) and trivially verifiable on Basescan.
 *      Because UDVTs resolve to their underlying type in the ABI, the resulting hook
 *      selectors are byte-for-byte identical to delegation-framework v1.3.0 — the real
 *      DelegationManager calls into this contract exactly as it would a framework enforcer.
 */
type ModeCode is bytes32;

/**
 * @title ICaveatEnforcer
 * @notice Minimal mirror of `delegation-framework/src/interfaces/ICaveatEnforcer.sol` @ v1.3.0.
 *         The DelegationManager invokes these four hooks (in order) during redemption;
 *         reverting in any of them reverts the whole redemption.
 */
interface ICaveatEnforcer {
    function beforeAllHook(
        bytes calldata terms,
        bytes calldata args,
        ModeCode mode,
        bytes calldata executionCalldata,
        bytes32 delegationHash,
        address delegator,
        address redeemer
    ) external;

    function beforeHook(
        bytes calldata terms,
        bytes calldata args,
        ModeCode mode,
        bytes calldata executionCalldata,
        bytes32 delegationHash,
        address delegator,
        address redeemer
    ) external;

    function afterHook(
        bytes calldata terms,
        bytes calldata args,
        ModeCode mode,
        bytes calldata executionCalldata,
        bytes32 delegationHash,
        address delegator,
        address redeemer
    ) external;

    function afterAllHook(
        bytes calldata terms,
        bytes calldata args,
        ModeCode mode,
        bytes calldata executionCalldata,
        bytes32 delegationHash,
        address delegator,
        address redeemer
    ) external;
}

/**
 * @title VeniceCollapseEnforcer
 * @notice Caveat enforcer that gates execution on a Venice AI reasoning hash being
 *         submitted onchain and selected as the winning collapse candidate.
 *
 * @dev How it works:
 *  1. Backend submits keccak256(reasoning_content) + confidence (0-100) for each
 *     of the three agents via submitReasoningHash().
 *  2. Once all agents have submitted, the wavefunction auto-collapses: the highest-
 *     confidence entry is selected as the winner.
 *  3. The winning agent's delegation carries a caveat term encoding:
 *       abi.encode(bytes32 sessionId, uint8 agentId)
 *     beforeHook checks that (sessionId, agentId) == (collapsedSession, collapsedWinner).
 *  4. Losing agents attempting redeemDelegations() are reverted by beforeHook.
 *
 * @dev Caveat terms ABI encoding:
 *     bytes terms = abi.encode(bytes32 sessionId, uint8 agentId)
 */
contract VeniceCollapseEnforcer is ICaveatEnforcer {
    // ─────────────────────────────────────────────────────── Events ──
    event ReasoningHashSubmitted(
        bytes32 indexed sessionId,
        uint8 indexed agentId,
        bytes32 reasoningHash,
        uint8 confidence
    );

    event WavefunctionCollapsed(
        bytes32 indexed sessionId,
        uint8 indexed winnerAgentId,
        bytes32 winnerHash,
        uint8 winnerConfidence
    );

    // ─────────────────────────────────────────────────────── Types ───
    struct AgentSubmission {
        bytes32 reasoningHash;
        uint8 confidence; // 0–100
        bool submitted;
    }

    struct Session {
        mapping(uint8 => AgentSubmission) agents; // agentId => submission
        uint8 submissionCount;
        uint8 requiredAgents; // set at session init (typically 3)
        uint8 winnerAgentId;
        bool collapsed;
        address initiator; // backend EOA that may submit
    }

    // ─────────────────────────────────────────────────── Storage ─────
    mapping(bytes32 => Session) public sessions;

    // ─────────────────────────────────────── Session Lifecycle ────────

    /**
     * @notice Initialize a new collapse session.
     * @param sessionId  Unique ID derived from the user's intent hash.
     * @param agentCount Number of agents in superposition (typically 3).
     */
    function initSession(bytes32 sessionId, uint8 agentCount) external {
        require(sessions[sessionId].initiator == address(0), "Session exists");
        require(agentCount > 0 && agentCount <= 10, "Invalid agent count");
        sessions[sessionId].requiredAgents = agentCount;
        sessions[sessionId].initiator = msg.sender;
    }

    /**
     * @notice Submit a Venice AI reasoning hash for an agent.
     * @param sessionId     Session to submit into.
     * @param agentId       Agent index (0, 1, 2).
     * @param reasoningHash keccak256(reasoning_content string).
     * @param confidence    0–100 score parsed from Venice structured output.
     */
    function submitReasoningHash(
        bytes32 sessionId,
        uint8 agentId,
        bytes32 reasoningHash,
        uint8 confidence
    ) external {
        Session storage s = sessions[sessionId];
        require(s.initiator != address(0), "Session not found");
        require(msg.sender == s.initiator, "Not session initiator");
        require(!s.collapsed, "Already collapsed");
        require(agentId < s.requiredAgents, "Invalid agentId");
        require(!s.agents[agentId].submitted, "Already submitted");
        require(confidence <= 100, "Confidence out of range");

        s.agents[agentId] = AgentSubmission({
            reasoningHash: reasoningHash,
            confidence: confidence,
            submitted: true
        });
        s.submissionCount++;

        emit ReasoningHashSubmitted(sessionId, agentId, reasoningHash, confidence);

        // Auto-collapse once every agent has submitted.
        if (s.submissionCount == s.requiredAgents) {
            _collapse(sessionId);
        }
    }

    /**
     * @dev Pick the highest-confidence agent as the winner. On a tie, the lowest
     *      agentId wins (strict greater-than comparison).
     */
    function _collapse(bytes32 sessionId) internal {
        Session storage s = sessions[sessionId];
        uint8 winnerAgentId;
        uint8 highestConf;

        for (uint8 i = 0; i < s.requiredAgents; i++) {
            if (s.agents[i].confidence > highestConf) {
                highestConf = s.agents[i].confidence;
                winnerAgentId = i;
            }
        }

        s.winnerAgentId = winnerAgentId;
        s.collapsed = true;

        emit WavefunctionCollapsed(
            sessionId,
            winnerAgentId,
            s.agents[winnerAgentId].reasoningHash,
            highestConf
        );
    }

    // ─────────────────────────────────── ICaveatEnforcer Interface ────

    /**
     * @notice Called by the DelegationManager before executing a delegation.
     *         Reverts if the wavefunction has not collapsed to this agentId.
     * @param terms ABI-encoded (bytes32 sessionId, uint8 agentId)
     */
    function beforeHook(
        bytes calldata terms,
        bytes calldata, /* args */
        ModeCode, /* mode */
        bytes calldata, /* executionCalldata */
        bytes32, /* delegationHash */
        address, /* delegator */
        address /* redeemer */
    ) external view override {
        (bytes32 sessionId, uint8 agentId) = abi.decode(terms, (bytes32, uint8));
        Session storage s = sessions[sessionId];

        require(s.collapsed, "Wavefunction not yet collapsed");
        require(s.winnerAgentId == agentId, "This agent did not win collapse");
    }

    /// @notice Unused — required by the interface. No-op.
    function beforeAllHook(
        bytes calldata,
        bytes calldata,
        ModeCode,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure override {}

    /// @notice Unused — required by the interface. No-op.
    function afterHook(
        bytes calldata,
        bytes calldata,
        ModeCode,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure override {}

    /// @notice Unused — required by the interface. No-op.
    function afterAllHook(
        bytes calldata,
        bytes calldata,
        ModeCode,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure override {}

    // ─────────────────────────────────────────── View Helpers ─────────

    function getSession(bytes32 sessionId)
        external
        view
        returns (
            uint8 submissionCount,
            uint8 requiredAgents,
            uint8 winnerAgentId,
            bool collapsed,
            address initiator
        )
    {
        Session storage s = sessions[sessionId];
        return (s.submissionCount, s.requiredAgents, s.winnerAgentId, s.collapsed, s.initiator);
    }

    function getAgentSubmission(bytes32 sessionId, uint8 agentId)
        external
        view
        returns (bytes32 reasoningHash, uint8 confidence, bool submitted)
    {
        AgentSubmission storage a = sessions[sessionId].agents[agentId];
        return (a.reasoningHash, a.confidence, a.submitted);
    }
}
