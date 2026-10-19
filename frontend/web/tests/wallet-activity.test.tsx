import { expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "../app/components/AuthProvider";
import { WalletActivity } from "../app/components/WalletActivity";
import { RewardPayments } from "../app/components/RewardPayments";
import { stubApi } from "./helpers";

const me = { id: 1, github_id: 42, github_login: "contributor" };

it("shows the real wallet balance and verified activity without provisioning or a browser signer", async () => {
  const { calls } = stubApi({
    "/api/me": { body: me },
    "/api/sponsored/wallet": { body: { address: "0x" + "11".repeat(20), balance_units: "1250000", chain_id: 43113 } },
    "/api/sponsored/operations": { body: { items: [
      { id: 1, bounty_id: 7, kind: "fund", status: "verified", tx_hash: "0x" + "22".repeat(32) },
      { id: 2, bounty_id: 8, kind: "settle", status: "submitted", tx_hash: null },
    ] } },
  });
  render(<AuthProvider><WalletActivity /></AuthProvider>);
  await userEvent.click(await screen.findByText("1.25 USDC"));
  expect(await screen.findByText(/Confirmed · evidence verified/)).toBeInTheDocument();
  expect(screen.getByText(/Submitted · awaiting confirmation/)).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "View transaction ↗" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "View transaction ↗" })).toHaveAttribute("href", "https://testnet.snowtrace.io/tx/0x" + "22".repeat(32));
  expect(calls.every(call => call.startsWith("GET "))).toBe(true);
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByText(/Confirmed · evidence verified/)).not.toBeInTheDocument());
});

it.each([
  { body: { enabled: false, execution_mode: "direct" } },
  { status: 503, body: { detail: "Configuration unavailable" } },
])("never falls back to external wallet payment controls when configuration is disabled or fails", async config => {
  const { calls } = stubApi({
    "/api/me": { body: me },
    "/api/escrow/config": config,
    "/api/sponsored/wallet": { body: null },
    "/api/sponsored/operations": { body: { items: [] } },
  });
  render(<AuthProvider><RewardPayments /></AuthProvider>);
  expect(screen.queryByText(/Connect.*link wallet/i)).not.toBeInTheDocument();
  await screen.findByRole("button", { name: "Open my app wallet" });
  await waitFor(() => expect(screen.queryByText("Checking sponsored payments…")).not.toBeInTheDocument());
  expect(screen.queryByText(/Browser wallet|Browser connection|Connect.*link wallet/i)).not.toBeInTheDocument();
  expect(calls.some(call => call.includes("/api/avax/"))).toBe(false);
});
