import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WalletPage from "../app/wallet/page";
import { AuthProvider } from "../app/components/AuthProvider";
import { stubApi } from "./helpers";

it("loads an existing managed account and real balance without an injected wallet or provisioning", async () => {
  const { calls } = stubApi({
    "/api/me": { body: { id: 1, github_id: 42, github_login: "contributor" } },
    "/api/sponsored/operations": { body: { items: [] } },
    "/api/sponsored/wallet": { body: { address: "0x" + "11".repeat(20), balance_units: "1250000" } },
  });
  render(<AuthProvider><WalletPage /></AuthProvider>);
  expect(await screen.findByText("1.25")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy deposit address" })).toBeInTheDocument();
  expect(calls.every(call => call.startsWith("GET "))).toBe(true);
  expect(screen.queryByText(/Install.*wallet/i)).not.toBeInTheDocument();
});

it("provisions a missing smart account only after the user opens it", async () => {
  const { fetchMock, calls } = stubApi({
    "/api/me": { body: { id: 1, github_id: 42, github_login: "contributor" } },
    "/api/csrf": { body: { csrf_token: "test" } },
    "/api/sponsored/operations": { body: { items: [] } },
    "/api/sponsored/wallet": { body: null },
  });
  const fallback = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (input, init) => {
    if (String(input).endsWith("/api/sponsored/wallet") && init?.method === "POST") {
      calls.push("POST " + input);
      return { ok: true, json: async () => ({ address: "0x" + "11".repeat(20), balance_units: "1250000" }) } as Response;
    }
    return fallback(input, init);
  });
  render(<AuthProvider><WalletPage /></AuthProvider>);
  await userEvent.click(await screen.findByRole("button", { name: "Open my app wallet" }));
  expect(await screen.findByText("1.25")).toBeInTheDocument();
  expect(calls.some(call => call.startsWith("POST ") && call.endsWith("/api/sponsored/wallet"))).toBe(true);
});

it("does not fabricate a zero balance when sponsorship is unavailable", async () => {
  const { fetchMock } = stubApi({
    "/api/me": { body: { id: 1, github_id: 42, github_login: "contributor" } },
    "/api/csrf": { body: { csrf_token: "test" } },
    "/api/sponsored/operations": { body: { items: [] } },
    "/api/sponsored/wallet": { body: null },
  });
  const fallback = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (input, init) => String(input).endsWith("/api/sponsored/wallet") && init?.method === "POST"
    ? { ok: false, status: 503, json: async () => ({ detail: "Sponsorship unavailable." }) } as Response : fallback(input, init));
  render(<AuthProvider><WalletPage /></AuthProvider>);
  await userEvent.click(await screen.findByRole("button", { name: "Open my app wallet" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sponsorship unavailable.");
  expect(screen.getByText("—")).toBeInTheDocument();
});
