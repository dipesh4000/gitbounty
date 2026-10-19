import { expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BroadsheetLanding from "../app/components/BroadsheetLanding";
import { AuthProvider } from "../app/components/AuthProvider";
import { stubApi } from "./helpers";

function landing(issues: object, status = 200) {
  stubApi({ "/api/me": {status:401, body:{}}, "/api/issues": {status, body:issues}, "/api/escrow/bounties": {status:200, body:{items:[]}} });
  render(<AuthProvider><BroadsheetLanding /></AuthProvider>);
}
it("sends workspace actions to login and keeps information public", async () => {
  landing({items:[]});
  await screen.findByText("No bounties have been published yet.");
  expect(screen.getAllByRole("link", {name:"Explore bounties"})[0]).toHaveAttribute("href", "/login?next=%2Fexplore");
  expect(screen.getAllByRole("link", {name:"Create a bounty"})[0]).toHaveAttribute("href", "/login?next=%2Fmaintainers");
  expect(screen.getByRole("link", {name:"Sign in with GitHub"})).toHaveAttribute("href", "/login?next=%2Fexplore");
  expect(screen.getAllByRole("link", {name:"Docs"})[0]).toHaveAttribute("href", "/docs");
  expect(screen.getByRole("link", {name:/Install the extension/})).toHaveAttribute("href", "/extension");
});
it("renders real published rewards and labels the example separately", async () => {
  landing({items:[{id:1,number:12,title:"Fix keyboard navigation",repository:"org/app",html_url:"https://github.com/org/app/issues/12",language:"TypeScript",points:40}]});
  expect(await screen.findByRole("link", {name:/Fix keyboard navigation/})).toHaveAttribute("href", "https://github.com/org/app/issues/12");
  expect(screen.getByText("+40")).toBeInTheDocument();
  expect(screen.getByText(/Illustrative interface. Names/)).toBeInTheDocument();
});
it("shows API failures with a retry instead of invented rewards", async () => {
  landing({detail:"Database setup is incomplete."},503);
  expect(await screen.findByText(/Database setup is incomplete/)).toBeInTheDocument();
  expect(screen.getByRole("button", {name:"Retry"})).toBeInTheDocument();
});

it("filters real issues and lets visitors clear an empty search", async () => {
  const user = userEvent.setup();
  const { calls } = stubApi({ "/api/me": {status:401, body:{}}, "/api/issues": {body:{items:[]}}, "/api/escrow/bounties": {body:{items:[]}} });
  render(<AuthProvider><BroadsheetLanding /></AuthProvider>);
  await screen.findByText("No bounties have been published yet.");
  await user.type(screen.getByRole("searchbox", {name:"Search issue titles"}), "keyboard");
  await user.click(screen.getByRole("checkbox", {name:"Good first issues"}));
  await waitFor(() => expect(calls.some(call => call.includes("q=keyboard") && call.includes("beginner=true"))).toBe(true));
  await user.click(await screen.findByRole("button", {name:"Clear filters"}));
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(screen.getByRole("checkbox", {name:"Good first issues"})).not.toBeChecked();
});
