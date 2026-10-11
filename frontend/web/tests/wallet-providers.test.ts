import { expect, it, vi } from "vitest";
import { discoverWallets, selectWallet, walletProvider, walletError } from "../app/lib/walletProviders";

it("discovers and selects a wallet without asking for accounts", () => {
  const request = vi.fn();
  const provider = { request, on: vi.fn(), removeListener: vi.fn() };
  const update = vi.fn();
  const stop = discoverWallets(update);
  const detail = { info: { uuid: "wallet-a", name: "Wallet A" }, provider };
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  expect(update.mock.lastCall?.[0].filter((wallet: { id: string }) => wallet.id === "wallet-a")).toHaveLength(1);
  selectWallet(provider);
  expect(walletProvider()).toBe(provider);
  expect(request).not.toHaveBeenCalled();
  stop();
});

it("gives a safe recovery path for an unavailable wallet", () => {
  expect(walletError(new Error("Requested resource not available. Details: The tab is not active Version: viem"))).toContain("Do not reset an existing wallet without its recovery phrase");
});
