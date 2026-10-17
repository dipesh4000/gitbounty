// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract GitBountyEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant CLAIM_GRACE = 7 days;
    bytes32 public constant SETTLEMENT_TYPEHASH = keccak256(
        "Settlement(bytes32 bountyId,address recipient,address token,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    enum BountyState {
        Absent,
        Funded,
        Settled,
        Refunded
    }

    struct Bounty {
        address payer;
        uint256 amount;
        uint256 fundedAt;
        uint256 workEndsAt;
        uint256 claimUntil;
        BountyState state;
        address recipient;
    }

    struct Settlement {
        bytes32 bountyId;
        address recipient;
        address token;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    IERC20 public immutable token;
    address public immutable authorizationSigner;
    uint256 public totalLiabilities;
    mapping(bytes32 bountyId => Bounty) public bounties;

    event BountyFunded(
        bytes32 indexed bountyId,
        bytes32 indexed referenceId,
        address indexed payer,
        uint256 amount,
        uint256 fundedAt,
        uint256 workEndsAt,
        uint256 claimUntil
    );
    event BountySettled(
        bytes32 indexed bountyId,
        address indexed recipient,
        uint256 amount,
        bytes32 authorizationDigest
    );
    event BountyRefunded(bytes32 indexed bountyId, address indexed payer, uint256 amount);

    error InvalidConfiguration();
    error InvalidFundingTerms();
    error BountyAlreadyExists();
    error IncorrectFundingAmount();
    error BountyNotFunded();
    error InvalidSettlement();
    error InvalidAuthorization();
    error ClaimWindowClosed();
    error RefundNotAvailable();

    constructor(IERC20 token_, address authorizationSigner_)
        EIP712("GitBountyEscrow", "1")
    {
        if (address(token_) == address(0) || authorizationSigner_ == address(0)) {
            revert InvalidConfiguration();
        }
        token = token_;
        authorizationSigner = authorizationSigner_;
    }

    function bountyIdFor(address payer, bytes32 referenceId) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), payer, referenceId));
    }

    function fund(bytes32 referenceId, uint256 amount, uint256 workEndsAt)
        external
        nonReentrant
        returns (bytes32 bountyId)
    {
        if (
            referenceId == bytes32(0) || amount == 0 || workEndsAt <= block.timestamp
                || workEndsAt > type(uint256).max - CLAIM_GRACE
        ) revert InvalidFundingTerms();

        bountyId = bountyIdFor(msg.sender, referenceId);
        if (bounties[bountyId].state != BountyState.Absent) revert BountyAlreadyExists();

        uint256 claimUntil = workEndsAt + CLAIM_GRACE;
        bounties[bountyId] = Bounty({
            payer: msg.sender,
            amount: amount,
            fundedAt: block.timestamp,
            workEndsAt: workEndsAt,
            claimUntil: claimUntil,
            state: BountyState.Funded,
            recipient: address(0)
        });
        totalLiabilities += amount;

        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = token.balanceOf(address(this));
        if (balanceAfter < balanceBefore || balanceAfter - balanceBefore != amount) {
            revert IncorrectFundingAmount();
        }

        emit BountyFunded(
            bountyId,
            referenceId,
            msg.sender,
            amount,
            block.timestamp,
            workEndsAt,
            claimUntil
        );
    }

    function settle(Settlement calldata settlement, bytes calldata signature) external nonReentrant {
        Bounty storage bounty = bounties[settlement.bountyId];
        if (bounty.state != BountyState.Funded) revert BountyNotFunded();
        if (
            settlement.recipient == address(0) || settlement.token != address(token)
                || settlement.amount != bounty.amount || settlement.nonce != 0
                || settlement.deadline > bounty.claimUntil
        ) revert InvalidSettlement();
        if (block.timestamp >= settlement.deadline) revert ClaimWindowClosed();

        bytes32 digest = settlementDigest(settlement);
        if (ECDSA.recover(digest, signature) != authorizationSigner) {
            revert InvalidAuthorization();
        }

        bounty.state = BountyState.Settled;
        bounty.recipient = settlement.recipient;
        totalLiabilities -= bounty.amount;
        token.safeTransfer(settlement.recipient, bounty.amount);

        emit BountySettled(settlement.bountyId, settlement.recipient, bounty.amount, digest);
    }

    function refund(bytes32 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.state != BountyState.Funded) revert BountyNotFunded();
        if (block.timestamp < bounty.claimUntil) revert RefundNotAvailable();

        bounty.state = BountyState.Refunded;
        totalLiabilities -= bounty.amount;
        token.safeTransfer(bounty.payer, bounty.amount);

        emit BountyRefunded(bountyId, bounty.payer, bounty.amount);
    }

    function settlementDigest(Settlement calldata settlement) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    SETTLEMENT_TYPEHASH,
                    settlement.bountyId,
                    settlement.recipient,
                    settlement.token,
                    settlement.amount,
                    settlement.nonce,
                    settlement.deadline
                )
            )
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
