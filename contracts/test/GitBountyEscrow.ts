import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  getAddress,
  hashTypedData,
  keccak256,
  recoverTypedDataAddress,
  stringToHex,
  zeroAddress,
} from "viem";

const { viem, networkHelpers } = await network.create({ network: "hardhatFuji" });
const publicClient = await viem.getPublicClient();

const settlementTypes = {
  Settlement: [
    { name: "bountyId", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

async function setup() {
  const [payer, signer, recipient, stranger] = await viem.getWalletClients();
  const token = await viem.deployContract("MockUSDC");
  const escrow = await viem.deployContract("GitBountyEscrow", [
    token.address,
    signer.account.address,
  ]);
  const payerToken = await viem.getContractAt("MockUSDC", token.address, {
    client: { wallet: payer },
  });
  const payerEscrow = await viem.getContractAt("GitBountyEscrow", escrow.address, {
    client: { wallet: payer },
  });
  const strangerEscrow = await viem.getContractAt("GitBountyEscrow", escrow.address, {
    client: { wallet: stranger },
  });

  return {
    payer,
    signer,
    recipient,
    stranger,
    token,
    escrow,
    payerToken,
    payerEscrow,
    strangerEscrow,
  };
}

async function fund(
  fixture: Awaited<ReturnType<typeof setup>>,
  label: string,
  amount = 25_000_000n,
) {
  const referenceId = keccak256(stringToHex(label));
  const workEndsAt = BigInt(await networkHelpers.time.latest()) + 3_600n;
  const bountyId = await fixture.escrow.read.bountyIdFor([
    fixture.payer.account.address,
    referenceId,
  ]);

  await fixture.token.write.mint([fixture.payer.account.address, amount]);
  await fixture.payerToken.write.approve([fixture.escrow.address, amount]);
  await fixture.payerEscrow.write.fund([referenceId, amount, workEndsAt]);

  return {
    referenceId,
    bountyId,
    amount,
    workEndsAt,
    claimUntil: workEndsAt + 7n * 24n * 60n * 60n,
  };
}

function settlementFor(
  fixture: Awaited<ReturnType<typeof setup>>,
  funded: Awaited<ReturnType<typeof fund>>,
) {
  return {
    bountyId: funded.bountyId,
    recipient: fixture.recipient.account.address,
    token: fixture.token.address,
    amount: funded.amount,
    nonce: 0n,
    deadline: funded.claimUntil,
  };
}

async function signSettlement(
  fixture: Awaited<ReturnType<typeof setup>>,
  settlement: ReturnType<typeof settlementFor>,
  overrides: Record<string, unknown> = {},
) {
  return fixture.signer.signTypedData({
    domain: {
      name: "GitBountyEscrow",
      version: "1",
      chainId: 43113,
      verifyingContract: fixture.escrow.address,
      ...overrides,
    },
    types: settlementTypes,
    primaryType: "Settlement",
    message: settlement,
  });
}

describe("GitBountyEscrow", () => {
  it("funds the payer-derived ID with the exact token amount", async () => {
    const fixture = await setup();
    const funded = await fund(fixture, "funding");
    const bounty = await fixture.escrow.read.bounties([funded.bountyId]);

    assert.equal(getAddress(bounty[0]), getAddress(fixture.payer.account.address));
    assert.equal(bounty[1], funded.amount);
    assert.equal(bounty[3], funded.workEndsAt);
    assert.equal(bounty[4], funded.claimUntil);
    assert.equal(bounty[5], 1);
    assert.equal(await fixture.escrow.read.totalLiabilities(), funded.amount);
    assert.equal(await fixture.token.read.balanceOf([fixture.escrow.address]), funded.amount);

    await viem.assertions.revertWithCustomError(
      fixture.payerEscrow.write.fund([
        funded.referenceId,
        funded.amount,
        funded.workEndsAt,
      ]),
      fixture.escrow,
      "BountyAlreadyExists",
    );
  });

  it("rejects fee-on-transfer funding without leaving state behind", async () => {
    const fixture = await setup();
    const amount = 10_000_000n;
    const referenceId = keccak256(stringToHex("fee"));
    const workEndsAt = BigInt(await networkHelpers.time.latest()) + 3_600n;
    const bountyId = await fixture.escrow.read.bountyIdFor([
      fixture.payer.account.address,
      referenceId,
    ]);

    await fixture.token.write.mint([fixture.payer.account.address, amount]);
    await fixture.payerToken.write.approve([fixture.escrow.address, amount]);
    await fixture.token.write.setFeeBps([100n]);
    await viem.assertions.revertWithCustomError(
      fixture.payerEscrow.write.fund([referenceId, amount, workEndsAt]),
      fixture.escrow,
      "IncorrectFundingAmount",
    );

    assert.equal((await fixture.escrow.read.bounties([bountyId]))[5], 0);
    assert.equal(await fixture.escrow.read.totalLiabilities(), 0n);
  });

  it("settles permissionlessly to the signed recipient and blocks replay/refund", async () => {
    const fixture = await setup();
    const funded = await fund(fixture, "settle");
    const settlement = settlementFor(fixture, funded);
    const signature = await signSettlement(fixture, settlement);

    const viemDigest = hashTypedData({
      domain: {
        name: "GitBountyEscrow",
        version: "1",
        chainId: 43113,
        verifyingContract: fixture.escrow.address,
      },
      types: settlementTypes,
      primaryType: "Settlement",
      message: settlement,
    });
    assert.equal(await fixture.escrow.read.settlementDigest([settlement]), viemDigest);

    await fixture.strangerEscrow.write.settle([settlement, signature]);
    assert.equal(
      await fixture.token.read.balanceOf([fixture.recipient.account.address]),
      funded.amount,
    );
    assert.equal((await fixture.escrow.read.bounties([funded.bountyId]))[5], 2);
    assert.equal(await fixture.escrow.read.totalLiabilities(), 0n);

    for (const call of [
      fixture.strangerEscrow.write.settle([settlement, signature]),
      fixture.strangerEscrow.write.refund([funded.bountyId]),
    ]) {
      await viem.assertions.revertWithCustomError(
        call,
        fixture.escrow,
        "BountyNotFunded",
      );
    }
  });

  it("rejects altered terms, the wrong signer/domain, and malformed signatures", async () => {
    const fixture = await setup();
    const funded = await fund(fixture, "bad-vouchers");
    const settlement = settlementFor(fixture, funded);
    const validSignature = await signSettlement(fixture, settlement);

    const invalidTerms = [
      { ...settlement, recipient: zeroAddress },
      { ...settlement, token: fixture.stranger.account.address },
      { ...settlement, amount: settlement.amount + 1n },
      { ...settlement, nonce: 1n },
      { ...settlement, deadline: funded.claimUntil + 1n },
    ];
    for (const changed of invalidTerms) {
      await viem.assertions.revertWithCustomError(
        fixture.strangerEscrow.write.settle([changed, validSignature]),
        fixture.escrow,
        "InvalidSettlement",
      );
    }

    const changedRecipient = {
      ...settlement,
      recipient: fixture.stranger.account.address,
    };
    const wrongDomainSignature = await signSettlement(fixture, settlement, {
      chainId: 43114,
    });
    const wrongSignerSignature = await fixture.stranger.signTypedData({
      domain: {
        name: "GitBountyEscrow",
        version: "1",
        chainId: 43113,
        verifyingContract: fixture.escrow.address,
      },
      types: settlementTypes,
      primaryType: "Settlement",
      message: settlement,
    });

    for (const [terms, signature] of [
      [changedRecipient, validSignature],
      [settlement, wrongDomainSignature],
      [settlement, wrongSignerSignature],
    ] as const) {
      await viem.assertions.revertWithCustomError(
        fixture.strangerEscrow.write.settle([terms, signature]),
        fixture.escrow,
        "InvalidAuthorization",
      );
    }
    await viem.assertions.revertWithCustomError(
      fixture.strangerEscrow.write.settle([settlement, "0x1234"]),
      fixture.escrow,
      "ECDSAInvalidSignatureLength",
    );
  });

  it("allows settlement just before the boundary and refund at the boundary", async () => {
    const settleFixture = await setup();
    const settleFunded = await fund(settleFixture, "last-second");
    const settlement = settlementFor(settleFixture, settleFunded);
    const signature = await signSettlement(settleFixture, settlement);

    await networkHelpers.time.setNextBlockTimestamp(settleFunded.claimUntil - 1n);
    await settleFixture.strangerEscrow.write.settle([settlement, signature]);

    const refundFixture = await setup();
    const refundFunded = await fund(refundFixture, "refund-boundary");
    const expiredSettlement = settlementFor(refundFixture, refundFunded);
    const expiredSignature = await signSettlement(refundFixture, expiredSettlement);

    await networkHelpers.time.setNextBlockTimestamp(refundFunded.claimUntil);
    await viem.assertions.revertWithCustomError(
      refundFixture.strangerEscrow.write.settle([expiredSettlement, expiredSignature]),
      refundFixture.escrow,
      "ClaimWindowClosed",
    );
    await refundFixture.strangerEscrow.write.refund([refundFunded.bountyId]);
    assert.equal((await refundFixture.escrow.read.bounties([refundFunded.bountyId]))[5], 3);
    assert.equal(
      await refundFixture.token.read.balanceOf([refundFixture.payer.account.address]),
      refundFunded.amount,
    );
    await viem.assertions.revertWithCustomError(
      refundFixture.strangerEscrow.write.settle([expiredSettlement, expiredSignature]),
      refundFixture.escrow,
      "BountyNotFunded",
    );
  });

  it("preserves funded state when a token transfer fails", async () => {
    const fixture = await setup();
    const funded = await fund(fixture, "blocked-transfer");
    const settlement = settlementFor(fixture, funded);
    const signature = await signSettlement(fixture, settlement);

    await fixture.token.write.setTransfersBlocked([true]);
    await viem.assertions.revert(
      fixture.strangerEscrow.write.settle([settlement, signature]),
    );
    assert.equal((await fixture.escrow.read.bounties([funded.bountyId]))[5], 1);
    assert.equal(await fixture.escrow.read.totalLiabilities(), funded.amount);

    await fixture.token.write.setTransfersBlocked([false]);
    await fixture.strangerEscrow.write.settle([settlement, signature]);
  });

  it("keeps cross-bounty liabilities conserved despite direct donations", async () => {
    const fixture = await setup();
    const first = await fund(fixture, "first", 10_000_000n);
    const second = await fund(fixture, "second", 20_000_000n);
    const donation = 3_000_000n;

    await fixture.token.write.mint([fixture.escrow.address, donation]);
    assert.equal(
      await fixture.escrow.read.totalLiabilities(),
      first.amount + second.amount,
    );
    assert.equal(
      await fixture.token.read.balanceOf([fixture.escrow.address]),
      first.amount + second.amount + donation,
    );

    const settlement = settlementFor(fixture, first);
    await fixture.strangerEscrow.write.settle([
      settlement,
      await signSettlement(fixture, settlement),
    ]);
    assert.equal(await fixture.escrow.read.totalLiabilities(), second.amount);

    await networkHelpers.time.increaseTo(second.claimUntil);
    await fixture.strangerEscrow.write.refund([second.bountyId]);
    assert.equal(await fixture.escrow.read.totalLiabilities(), 0n);
    assert.equal(await fixture.token.read.balanceOf([fixture.escrow.address]), donation);
  });

  it("rejects invalid constructor and funding terms", async () => {
    const [deployer] = await viem.getWalletClients();
    const token = await viem.deployContract("MockUSDC");
    await assert.rejects(
      viem.deployContract("GitBountyEscrow", [zeroAddress, deployer.account.address]),
    );
    await assert.rejects(
      viem.deployContract("GitBountyEscrow", [token.address, zeroAddress]),
    );

    const fixture = await setup();
    const now = BigInt(await networkHelpers.time.latest());
    await viem.assertions.revertWithCustomError(
      fixture.payerEscrow.write.fund([
        `0x${"00".repeat(32)}`,
        1n,
        now + 100n,
      ]),
      fixture.escrow,
      "InvalidFundingTerms",
    );
  });

  it("matches the shared viem, Solidity, and Python EIP-712 golden vector", async () => {
    const vector = JSON.parse(
      readFileSync(new URL("./settlement-vector.json", import.meta.url), "utf8"),
    );
    const { viem: goldenViem } = await network.create({ network: "hardhatFuji" });
    const token = await goldenViem.deployContract("MockUSDC");
    const escrow = await goldenViem.deployContract("GitBountyEscrow", [
      token.address,
      vector.signer,
    ]);
    assert.equal(getAddress(token.address), getAddress(vector.message.token));
    assert.equal(
      getAddress(escrow.address),
      getAddress(vector.domain.verifyingContract),
    );

    const message = {
      ...vector.message,
      amount: BigInt(vector.message.amount),
      nonce: BigInt(vector.message.nonce),
      deadline: BigInt(vector.message.deadline),
    };
    assert.equal(
      hashTypedData({
        domain: vector.domain,
        types: settlementTypes,
        primaryType: "Settlement",
        message,
      }),
      vector.digest,
    );
    assert.equal(await escrow.read.settlementDigest([message]), vector.digest);
    assert.equal(
      getAddress(
        await recoverTypedDataAddress({
          domain: vector.domain,
          types: settlementTypes,
          primaryType: "Settlement",
          message,
          signature: vector.signature,
        }),
      ),
      getAddress(vector.signer),
    );
  });
});
