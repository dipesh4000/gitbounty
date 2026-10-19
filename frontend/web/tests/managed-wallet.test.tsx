import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WalletPage from "../app/wallet/page";
import { AuthProvider } from "../app/components/AuthProvider";
import { stubApi } from "./helpers";

it("opens the managed account through the app API without an injected wallet", async()=>{
  const {calls}=stubApi({
    "/api/me":{body:{id:1,github_id:42,github_login:"contributor"}},
    "/api/csrf":{body:{csrf_token:"test-csrf"}},
    "/api/sponsored/wallet":{body:{address:"0x"+"11".repeat(20),balance_units:"1250000"}},
  });
  render(<AuthProvider><WalletPage/></AuthProvider>);
  await userEvent.click(await screen.findByRole("button",{name:"Open my app wallet"}));
  expect(await screen.findByText("1.25")).toBeInTheDocument();
  expect(screen.getByText("0x"+"11".repeat(20))).toBeInTheDocument();
  expect(calls.some(call=>call.startsWith("POST ")&&call.endsWith("/api/sponsored/wallet"))).toBe(true);
  expect(screen.queryByText(/Install.*wallet/i)).not.toBeInTheDocument();
});

it("does not fabricate a zero balance when sponsorship is unavailable", async()=>{
  stubApi({"/api/me":{body:{id:1,github_id:42,github_login:"contributor"}},"/api/csrf":{body:{csrf_token:"test"}},"/api/sponsored/wallet":{status:503,body:{detail:"Sponsorship unavailable."}}});
  render(<AuthProvider><WalletPage/></AuthProvider>);
  await userEvent.click(await screen.findByRole("button",{name:"Open my app wallet"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sponsorship unavailable.");
  expect(screen.getByText("—")).toBeInTheDocument();
});
