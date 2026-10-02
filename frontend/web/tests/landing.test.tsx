/*
  The public landing page. These exist because it used to be made entirely of invented data: nine fake
  issues, a nine-person fake leaderboard, and a fake "your rank" row. The tests are mostly about what must
  never come back.
*/
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import BroadsheetLanding from "../app/components/BroadsheetLanding";
import { AuthProvider } from "../app/components/AuthProvider";
import { API, captureNavigation, stubApi, stubPendingApi } from "./helpers";

const EMPTY_ISSUES = { items: [], page: 1, per_page: 100, sort: "updated", has_more: false };
const EMPTY_BOARD = {
  period: "all", category: null, entries: [], page: 1, per_page: 10, total: 0, has_more: false, me: null,
};

const renderLanding = (routes: Parameters<typeof stubApi>[0]) => {
  const stub = stubApi({ "/api/me": { status: 401, body: {} }, ...routes });
  render(<AuthProvider><BroadsheetLanding /></AuthProvider>);
  return stub;
};

const issue = (overrides: Record<string, unknown> = {}) => ({
  id: 1, number: 12, title: "Keyboard navigation skips the filter chips",
  html_url: "https://github.com/localorg/widgets/issues/12", category: "frontend",
  language: "TypeScript", labels: ["a11y"], comments_count: 0,
  issue_created_at: null, issue_updated_at: null, repository: "localorg/widgets",
  repository_description: null, stars: 1200, points: 40, posted_by: "maintainer", ...overrides,
});

describe("the issue list", () => {
  it("reads the live API and shows what it returned", async () => {
    renderLanding({
      "/api/issues": { body: { ...EMPTY_ISSUES, items: [issue()] } },
      "/api/leaderboard": { body: EMPTY_BOARD },
    });

    const title = await screen.findByText("Keyboard navigation skips the filter chips");
    // The hero illustration also contains a "+40"; scope to the row this issue is in.
    const row = title.closest("li")!;
    expect(within(row).getByText("+40")).toBeInTheDocument();
    expect(within(row).getByText(/localorg\/widgets/)).toBeInTheDocument();
    expect(screen.getByText(/1 published bounty/)).toBeInTheDocument();
  });

  it("links a row to the real GitHub issue", async () => {
    renderLanding({
      "/api/issues": { body: { ...EMPTY_ISSUES, items: [issue()] } },
      "/api/leaderboard": { body: EMPTY_BOARD },
    });

    const link = (await screen.findByText("Keyboard navigation skips the filter chips")).closest("a")!;
    expect(link).toHaveAttribute("href", "https://github.com/localorg/widgets/issues/12");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows a loading state rather than placeholder rows", async () => {
    stubPendingApi();
    render(<AuthProvider><BroadsheetLanding /></AuthProvider>);

    expect(await screen.findByText(/Loading published bounties/)).toBeInTheDocument();
  });

  it("reports a failure with the reason, and offers a retry", async () => {
    renderLanding({
      "/api/issues": { status: 503, body: { detail: "The database is not reachable right now." } },
      "/api/leaderboard": { body: EMPTY_BOARD },
    });

    expect(await screen.findByText("Published bounties didn’t load.")).toBeInTheDocument();
    expect(screen.getByText(/The database is not reachable right now/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("invites the first bounty when nothing has been published", async () => {
    renderLanding({ "/api/issues": { body: EMPTY_ISSUES }, "/api/leaderboard": { body: EMPTY_BOARD } });

    expect(await screen.findByText("No bounties have been published yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect GitHub to publish" })).toBeInTheDocument();
  });
});

describe("the leaderboard section", () => {
  it("shows the real ranking", async () => {
    renderLanding({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/leaderboard": {
        body: {
          ...EMPTY_BOARD, total: 1,
          entries: [{ rank: 1, github_login: "contributor", avatar_url: null, points: 45, merges: 1 }],
        },
      },
    });

    expect(await screen.findByText("@contributor")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
  });

  it("shows no 'your rank' row when nobody is signed in", async () => {
    renderLanding({ "/api/issues": { body: EMPTY_ISSUES }, "/api/leaderboard": { body: EMPTY_BOARD } });

    await screen.findByText(/Nobody has earned points/);
    expect(screen.queryByText(/^You /)).not.toBeInTheDocument();
  });

  it("asks the API for the chosen window", async () => {
    const { calls } = renderLanding({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/leaderboard": { body: EMPTY_BOARD },
    });
    await screen.findByText(/Nobody has earned points/);

    await userEvent.click(screen.getByRole("button", { name: "Week" }));

    await waitFor(() =>
      expect(calls.some((call) => call.includes("/api/leaderboard") && call.includes("period=week")))
        .toBe(true),
    );
  });
});

describe("what must never come back", () => {
  it("contains none of the invented repositories, people or totals", async () => {
    const { container } = render(
      <AuthProvider><BroadsheetLanding /></AuthProvider>,
      { wrapper: undefined },
    );
    stubApi({
      "/api/me": { status: 401, body: {} },
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/leaderboard": { body: EMPTY_BOARD },
    });

    await waitFor(() => expect(container.textContent).toBeTruthy());
    const text = container.textContent ?? "";
    for (const invented of [
      "openframe/core", "relaylabs/queue", "marrow/orm", "halyard/docs",
      "maya-dev", "jkoenig", "amara-o", "tdrummond", "4,210", "PREVIEW STATE",
    ]) {
      expect(text).not.toContain(invented);
    }
  });

  it("sends Connect GitHub to the backend's OAuth route", async () => {
    const navigation = captureNavigation();
    renderLanding({ "/api/issues": { body: EMPTY_ISSUES }, "/api/leaderboard": { body: EMPTY_BOARD } });
    await screen.findByText(/Nobody has earned points/);

    await userEvent.click(screen.getAllByRole("button", { name: "Connect GitHub" })[0]);

    expect(navigation.assigned).toEqual([`${API}/auth/github`]);
  });
});
