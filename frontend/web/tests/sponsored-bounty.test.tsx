import { Suspense } from "react";
import { it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BountyPage from "../app/bounties/[id]/page";
import { AuthProvider } from "../app/components/AuthProvider";
import { stubApi } from "./helpers";

it("requires a funding review and explicit confirmation before submitting a sponsored operation",async()=>{
  const {calls}=stubApi({
    "/api/me":{body:{id:1,github_id:42,github_login:"maintainer"}},
    "/api/csrf":{body:{csrf_token:"test"}},
    "/api/escrow/bounties/1":{body:{bounty_id:1,repo_full_name:"org/repo",issue_number:7,points:40,amount_units:"1250000",payer_github_id:42,contract_address:"0x"+"11".repeat(20),escrow_state:"unfunded",work_ends_at:"2099-10-18T10:00:00Z",claim_until:"2099-10-25T10:00:00Z",funding_tx_hash:null,settlement_tx_hash:null,author_github_id:null}},
    "/api/sponsored/operations/8/verify":{body:{id:8,status:"submitted"}},
    "/api/sponsored/operations":{body:{items:[]}},
    "/api/sponsored/bounties/1":{body:{id:8,status:"signed"}},
  });
  const params=Promise.resolve({id:"1"});
  await act(async()=>{render(<AuthProvider><Suspense fallback={<p>Loading</p>}><BountyPage params={params}/></Suspense></AuthProvider>);});
  await userEvent.click(await screen.findByRole("button",{name:"Review & fund 1.25 USDC"}));
  expect(calls.some(call=>call.startsWith("POST ")&&call.endsWith("/api/sponsored/bounties/1"))).toBe(false);
  await userEvent.click(screen.getByRole("button",{name:"Confirm fund reward"}));
  expect(await screen.findByText(/Submitted to Avalanche/)).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Check confirmation / retry saved operation"})).toBeInTheDocument();
  expect(calls.some(call=>call.startsWith("POST ")&&call.endsWith("/api/sponsored/bounties/1"))).toBe(true);
});
