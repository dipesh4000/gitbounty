import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AvaxRewards } from "../app/components/AvaxRewards";
import { stubApi } from "./helpers";

vi.mock("../app/lib/wallet", () => ({ connectRewardWallet: vi.fn(async () => ({ address: "0xwallet" })),
  inspectRewardFunding: vi.fn(async () => ({ rewardBalance: "2", feeBalance: "2", rewardRequired: "1.35", feeRequired: "0.1", sufficient: true, checkedAt: "2026-10-11T12:00:00Z" })),
  quoteReward: vi.fn(async () => "0.002000"), sendReward: vi.fn(async () => "0x" + "a".repeat(64)) }));

const reward = { id: 1, github_id: 10, is_payer: false, repository: "org/repo", issue_number: 2,
  reward_amount: "1.25", symbol: "USDC", network: "Avalanche Fuji", testnet: true, chain_id: 43113, explorer: "https://testnet.snowtrace.io", claimed_at: null, review_status: "clear", status: null, tx_hash: null };

it("shows an owner's promise before an allocation exists and explains the missing payout", async () => {
  stubApi({ "/api/avax/rewards": { body: { enabled: true, wallet: null, items: [], owner_promises: [{
    repository: "dipesh4000/Orbit-AI-Powered-College-Learning-Assistant", issue_number: 1,
    bounty_status: "published", reward_amount: "2", symbol: "USDC", network: "Avalanche Fuji",
  }] } } });
  render(<AvaxRewards />);
  expect(await screen.findByText("You promised 2 USDC · Avalanche Fuji")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pay contributor — awaiting verification" })).toBeDisabled();
  expect(screen.getByText(/Closing the issue alone does not create a payment/)).toBeInTheDocument();
});

it("keeps live wallet actions disabled until configured", async () => {
  stubApi({ "/api/avax/rewards": { body: { enabled: false, wallet: null, items: [reward] } } });
  render(<AvaxRewards />);
  expect(await screen.findByRole("button", { name: "Connect wallet and claim" })).toBeDisabled();
});

it("distinguishes a linked wallet from a checked browser connection", async () => {
  stubApi({ "/api/avax/rewards": { body: { enabled: true, wallet: "0xlinked", items: [] } } });
  render(<AvaxRewards />);
  expect(await screen.findByText("Wallet linked to GitHub")).toBeInTheDocument();
  expect(screen.getByText("Not checked", { exact: false })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Connect & link wallet" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Check browser connection" }));
  expect(await screen.findByText(/Disconnected or locked/)).toBeInTheDocument();
});

it("separates owner payouts and contributor rewards with explicit waiting states", async () => {
  stubApi({ "/api/avax/rewards": { body: { enabled: true, wallet: "0xlinked", items: [
    { ...reward, id: 1, is_payer: true, contributor_login: "sam" },
    { ...reward, id: 2, claimed_at: "now", payer_login: "alex" },
  ] } } });
  render(<AvaxRewards />);
  expect(await screen.findByText("Waiting for contributor claim")).toBeInTheDocument();
  expect(screen.getByText("Claimed · awaiting owner payment")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Owner payouts" }));
  expect(screen.getByText("Pay @sam")).toBeInTheDocument();
  expect(screen.queryByText("Promised by @alex")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Waiting for contributor" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Contributor rewards" }));
  expect(screen.getByText("Promised by @alex")).toBeInTheDocument();
});

it("connects only on an explicit contributor claim and sends no amount or recipient", async () => {
  const wallet = await import("../app/lib/wallet");
  vi.mocked(wallet.connectRewardWallet).mockClear();
  const { calls, fetchMock } = stubApi({ "/api/avax/rewards": { body: { enabled: true, wallet: null, items: [reward] } },
    "/api/avax/rewards/1/claim": { body: {} }, "/api/csrf": { body: { csrf_token: "csrf" } } });
  render(<AvaxRewards />);
  const button = await screen.findByRole("button", { name: "Connect wallet and claim" });
  expect(wallet.connectRewardWallet).not.toHaveBeenCalled();
  await userEvent.click(button);
  await screen.findByText("Claim recorded. The owner must pay the promised USDC.");
  expect(wallet.connectRewardWallet).toHaveBeenCalledTimes(1);
  expect(calls.filter(call => call.startsWith("POST"))).toEqual(["POST http://localhost:8001/api/avax/rewards/1/claim"]);
  const request = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/claim"));
  expect(request?.[1]?.body).toBeUndefined();
});

it("verifies a submitted owner payment without opening another transfer", async () => {
  const wallet = await import("../app/lib/wallet");
  vi.mocked(wallet.sendReward).mockClear();
  const hash = "0x" + "a".repeat(64);
  stubApi({ "/api/avax/rewards": { body: { enabled: true, wallet: "0xwallet", items: [{ ...reward,
    is_payer: true, claimed_at: "now", status: "submitted", userop_hash: hash, tx_hash: null }] } },
    "/api/avax/rewards/1/payment": { body: { status: "submitted", userop_hash: hash, tx_hash: null } },
    "/api/avax/rewards/1/payment/confirm": { body: { status: "paid" } },
    "/api/csrf": { body: { csrf_token: "csrf" } } });
  render(<AvaxRewards />);
  await userEvent.click(await screen.findByRole("button", { name: "Verify payment" }));
  await waitFor(() => expect(screen.getByText("Payment verified on Avalanche Fuji.")).toBeInTheDocument());
  expect(wallet.sendReward).not.toHaveBeenCalled();
});


it("requires an explicit owner review with funding address and fee before submitting", async () => {
  const wallet = await import("../app/lib/wallet");
  vi.mocked(wallet.sendReward).mockClear();
  const { calls } = stubApi({ "/api/avax/rewards": { body: { enabled: true, wallet: "0xowner", items: [{ ...reward,
    is_payer: true, claimed_at: "now", receiving_wallet: "0xrecipient" }] } },
    "/api/avax/rewards/1/payment": { body: { claim_id: 1, smart_sender: "0xfunding", fee_token: "0xtoken", token_address: "0xtoken", fee_limit_usdc: "0.1", status: "awaiting_signature" } },
    "/api/avax/rewards/1/payment/confirm": { body: { status: "paid" } },
    "/api/csrf": { body: { csrf_token: "csrf" } } });
  render(<AvaxRewards />);
  await userEvent.click(await screen.findByRole("button", { name: "Review payment" }));
  expect(await screen.findByText(/Payout account has sufficient funds/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Confirm in wallet" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Continue to payment review" }));
  expect(await screen.findByText("0.002000 USDC")).toBeInTheDocument();
  expect(screen.getByText("0xfunding")).toBeInTheDocument();
  expect(screen.getByText("0xrecipient")).toBeInTheDocument();
  expect(wallet.sendReward).not.toHaveBeenCalled();
  expect(calls.some(call => call.endsWith("/confirm"))).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Confirm in wallet" }));
  await screen.findByText("Payment verified on Avalanche Fuji.");
  expect(wallet.sendReward).toHaveBeenCalledTimes(1);
});

it("shows the funding address before a fee quote and blocks an unfunded payout", async () => {
  const wallet = await import("../app/lib/wallet");
  vi.mocked(wallet.quoteReward).mockClear();
  vi.mocked(wallet.sendReward).mockClear();
  vi.mocked(wallet.inspectRewardFunding).mockResolvedValueOnce({ rewardBalance: "0", feeBalance: "0", rewardRequired: "1.35", feeRequired: "0.1", sufficient: false, checkedAt: "2026-10-11T12:00:00Z" });
  stubApi({ "/api/avax/rewards": { body: { enabled: true, wallet: "0xowner", items: [{ ...reward, is_payer: true, claimed_at: "now" }] } },
    "/api/avax/rewards/1/payment": { body: { smart_sender: "0xfunding", token_address: "0xtoken", fee_token: "0xtoken", fee_limit_usdc: "0.1" } },
    "/api/csrf": { body: { csrf_token: "csrf" } } });
  render(<AvaxRewards />);
  await userEvent.click(await screen.findByRole("button", { name: "Review payment" }));
  expect(await screen.findByText(/Funding needed:/)).toBeInTheDocument();
  expect(screen.getByText("0xfunding")).toBeInTheDocument();
  expect(screen.getByText("1.35 USDC")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue to payment review" })).toBeDisabled();
  expect(wallet.quoteReward).not.toHaveBeenCalled();
  expect(wallet.sendReward).not.toHaveBeenCalled();
});
