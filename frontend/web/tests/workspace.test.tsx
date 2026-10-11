/*
  The signed-in workspace: the opportunity explorer, My PRs, the points ledger and the leaderboard.

  These are about the states a visitor can actually land in -- loading, failure, empty, and populated --
  and about the two claims the product must never get wrong: that a figure is a forecast rather than an
  award, and that an empty table says which kind of empty it is.
*/
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuthProvider } from "../app/components/AuthProvider";
import { ContributorWorkspace, ClaimPoints } from "../app/components/ContributorWorkspace";
import { captureNavigation, stubApi, stubPendingApi } from "./helpers";

const ME = { id: 1, github_id: 42, github_login: "octocat", name: null, avatar_url: null };

const NEVER_SYNCED = {
  state: "never", started_at: null, finished_at: null, prs_seen: 0, self_merges_skipped: 0,
  newly_counted: 0, points_awarded: 0, error: null, retry_after_seconds: null,
};

const POINTS = {
  github_login: "octocat", total_points: 45, week_points: 45, total_merges: 1,
  points_by_category: { frontend: 45 }, recent_merges: [], sync: NEVER_SYNCED,
};

const EMPTY_ISSUES = { items: [], page: 1, per_page: 25, sort: "updated", has_more: false };
const EMPTY_PRS = {
  github_login: "octocat", items: [], page: 1, per_page: 25, total: 0, has_more: false,
  counts: {}, sync: NEVER_SYNCED,
};

function renderWorkspace(routes: Parameters<typeof stubApi>[0]) {
  const stub = stubApi({ "/api/me": { body: ME }, "/api/me/claims": { body: { items: [], points: 0 } }, ...routes });
  render(<AuthProvider><ContributorWorkspace /></AuthProvider>);
  return stub;
}

async function openTab(name: string) {
  await userEvent.click(await screen.findByRole("button", { name }));
}

// --- the opportunity explorer ------------------------------------------------

describe("the opportunity explorer", () => {
  it("waits for identity without requesting workspace data", () => {
    stubPendingApi();
    render(<AuthProvider><ContributorWorkspace /></AuthProvider>);
    expect(screen.getByRole("button", { name: /Checking your session/ })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Explore bounties" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("debounces typed filters after sign-in", async () => {
    const { calls } = renderWorkspace({ "/api/issues": { body: EMPTY_ISSUES }, "/api/me/points": { body: POINTS } });
    await screen.findByText("No bounties have been published yet.");
    await userEvent.type(screen.getByRole("textbox", { name: "Search published bounties" }), "keyboard");
    expect(calls.filter(call => call.includes("/api/issues"))).toHaveLength(1);
    await waitFor(() => expect(calls.filter(call => call.includes("/api/issues"))).toHaveLength(2));
    expect(calls.at(-1)).toContain("q=keyboard");
  });

  it("invites the first bounty when nothing has been published", async () => {
    renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
    });

    expect(await screen.findByText("No bounties have been published yet.")).toBeInTheDocument();
    expect(screen.getByText(/Be the first/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish your first bounty" })).toBeInTheDocument();
  });

  it("does not suggest a database failure when the list is simply empty", async () => {
    renderWorkspace({ "/api/issues": { body: EMPTY_ISSUES }, "/api/me/points": { body: POINTS } });

    await screen.findByText("No bounties have been published yet.");
    expect(screen.queryByText(/migration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("reports an API failure with the reason, and offers to retry", async () => {
    renderWorkspace({
      "/api/issues": { status: 503, body: { detail: "The database is not reachable right now." } },
      "/api/me/points": { body: POINTS },
    });

    expect(await screen.findByText("Couldn’t load published bounties.")).toBeInTheDocument();
    expect(screen.getByText("The database is not reachable right now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("lists published bounties with their points and publisher", async () => {
    renderWorkspace({
      "/api/issues": {
        body: {
          ...EMPTY_ISSUES,
          items: [{
            id: 1, number: 12, title: "Keyboard navigation", html_url: "https://github.com/org/app/issues/12",
            category: "frontend", language: "TypeScript", labels: [], comments_count: 0,
            issue_created_at: null, issue_updated_at: null, repository: "org/app",
            repository_description: null, stars: 10, points: 40, posted_by: "maintainer",
          }],
        },
      },
      "/api/me/points": { body: POINTS },
    });

    const row = (await screen.findByRole("link", { name: "Keyboard navigation" })).closest(".app-table-row")!;
    expect(within(row as HTMLElement).getByText("+40")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("@maintainer")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("github.com/org/app")).toBeInTheDocument();
  });
});

// --- my pull requests ---------------------------------------------------------

describe("my pull requests", () => {
  const pull = (overrides: Record<string, unknown> = {}) => ({
    github_pr_id: 1, repo_full_name: "org/app", number: 7, title: "Fix the thing",
    url: "https://github.com/org/app/pull/7", state: "open", is_draft: false,
    category: "frontend", category_source: "inferred",
    bounty_repo_full_name: null, bounty_issue_number: null, bounty_points: null,
    baseline_eligible: true, eligible: true, ineligible_reason: null,
    expected_points: 5, awarded_points: 0,
    pr_created_at: "2026-09-01T00:00:00Z", pr_updated_at: "2026-09-20T00:00:00Z",
    merged_at: null, closed_at: null, ...overrides,
  });

  it("says GitBounty has never looked, rather than showing an empty table", async () => {
    renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/me/pull-requests": { body: EMPTY_PRS },
    });
    await openTab("My PRs");

    expect(await screen.findByText(/hasn’t looked at your GitHub activity yet/)).toBeInTheDocument();
  });

  it("distinguishes a failed sync from an empty one", async () => {
    renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/me/pull-requests": {
        body: {
          ...EMPTY_PRS,
          sync: { ...NEVER_SYNCED, state: "failed", error: "GitHub's rate limit was reached." },
        },
      },
    });
    await openTab("My PRs");

    expect(await screen.findByText("The last sync didn’t finish.")).toBeInTheDocument();
    expect(screen.getByText("GitHub's rate limit was reached.")).toBeInTheDocument();
  });

  it("shows an expected figure for open work and an awarded figure for merged work", async () => {
    renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/me/pull-requests": {
        body: {
          ...EMPTY_PRS,
          total: 2,
          counts: { open: 1, merged: 1 },
          items: [
            pull({ github_pr_id: 1, number: 7, state: "open", expected_points: 45, awarded_points: 0,
                   bounty_repo_full_name: "org/app", bounty_issue_number: 12, bounty_points: 40 }),
            pull({ github_pr_id: 2, number: 8, state: "merged", expected_points: 45, awarded_points: 45,
                   merged_at: "2026-09-21T00:00:00Z", title: "Merged work" }),
          ],
        },
      },
    });
    await openTab("My PRs");

    const open = (await screen.findByRole("link", { name: "Fix the thing" })).closest(".app-table-row")!;
    expect(within(open as HTMLElement).getByText("+45")).toBeInTheDocument();
    expect(within(open as HTMLElement).getByText("if merged")).toBeInTheDocument();
    expect(within(open as HTMLElement).queryByText("awarded")).not.toBeInTheDocument();

    const merged = screen.getByRole("link", { name: "Merged work" }).closest(".app-table-row")!;
    expect(within(merged as HTMLElement).getByText("awarded")).toBeInTheDocument();
  });

  it("shows the reason an ineligible pull request earns nothing", async () => {
    renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/me/pull-requests": {
        body: {
          ...EMPTY_PRS, total: 1, counts: { merged: 1 },
          items: [pull({
            state: "merged", merged_at: "2026-09-21T00:00:00Z", eligible: false,
            expected_points: 0, awarded_points: 0,
            ineligible_reason: "Merging your own pull request into a repository you own earns nothing.",
          })],
        },
      },
    });
    await openTab("My PRs");

    expect(await screen.findByText(/Merging your own pull request/)).toBeInTheDocument();
  });

  it("filters by state and asks the API for it", async () => {
    const { calls } = renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/me/pull-requests": {
        body: { ...EMPTY_PRS, total: 1, counts: { merged: 1, open: 2 }, items: [pull()] },
      },
    });
    await openTab("My PRs");
    await screen.findByRole("link", { name: "Fix the thing" });

    await userEvent.click(screen.getByRole("button", { name: /^Merged/ }));

    await waitFor(() =>
      expect(calls.some((call) => call.includes("/api/me/pull-requests") && call.includes("state=merged")))
        .toBe(true),
    );
  });

  it("offers a Sync GitHub control", async () => {
    renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/me/pull-requests": { body: EMPTY_PRS },
    });
    await openTab("My PRs");

    expect(await screen.findByRole("button", { name: "Sync GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Full re-sync" })).toBeInTheDocument();
  });
});

// --- the points ledger --------------------------------------------------------

describe("the points history", () => {
  it("renders each entry with where it came from and the rules that produced it", async () => {
    renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/me/points/history": {
        body: {
          github_login: "octocat", total_points: 45, page: 1, per_page: 25, total: 2, has_more: false,
          rules: { rule_version: "points-v1", baseline_per_merge: 5, min_bounty_points: 1, max_bounty_points: 1000 },
          entries: [
            {
              id: 2, kind: "bounty_award", points: 40, category: "docs", category_source: "maintainer",
              rule_version: "points-v1", reason: "Merged pull request closed the bounty.",
              pr_repo_full_name: "org/app", pr_number: 7, pr_url: "https://github.com/org/app/pull/7",
              bounty_repo_full_name: "org/app", bounty_issue_number: 12, bounty_points_at_award: 40,
              merged_at: "2026-09-21T00:00:00Z", created_at: "2026-09-21T00:00:00Z",
            },
            {
              id: 1, kind: "baseline_award", points: 5, category: "docs", category_source: "inferred",
              rule_version: "points-v1", reason: "Flat award for a merged pull request.",
              pr_repo_full_name: "org/app", pr_number: 7, pr_url: "https://github.com/org/app/pull/7",
              bounty_repo_full_name: null, bounty_issue_number: null, bounty_points_at_award: null,
              merged_at: "2026-09-21T00:00:00Z", created_at: "2026-09-21T00:00:00Z",
            },
          ],
        },
      },
    });
    await openTab("Points");

    expect(await screen.findByText("Bounty")).toBeInTheDocument();
    expect(screen.getByText("Baseline")).toBeInTheDocument();
    expect(screen.getByText("+40")).toBeInTheDocument();
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByText(/org\/app#12 · worth 40 at the time/)).toBeInTheDocument();
    expect(screen.getByText(/points-v1/)).toBeInTheDocument();
  });

  it("is honestly empty before anything is earned", async () => {
    renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/me/points/history": {
        body: {
          github_login: "octocat", total_points: 0, page: 1, per_page: 25, total: 0, has_more: false,
          entries: [],
          rules: { rule_version: "points-v1", baseline_per_merge: 5, min_bounty_points: 1, max_bounty_points: 1000 },
        },
      },
    });
    await openTab("Points");

    expect(await screen.findByText("No points yet.")).toBeInTheDocument();
  });
});

// --- the leaderboard ----------------------------------------------------------

describe("the leaderboard", () => {
  const board = (entries: unknown[], extra: Record<string, unknown> = {}) => ({
    period: "all", category: null, entries, page: 1, per_page: 25,
    total: entries.length, has_more: false, me: null, ...extra,
  });

  it("asks for a category when one is chosen", async () => {
    const { calls } = renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/leaderboard": {
        body: board([{ rank: 1, github_login: "octocat", avatar_url: null, points: 45, merges: 1 }]),
      },
    });
    await openTab("Leaderboard");
    // The header also shows "@octocat"; scope to the board itself.
    const section = await screen.findByRole("region", { name: "Leaderboard" });
    await within(section).findByText("@octocat");

    await userEvent.click(screen.getByRole("button", { name: "Docs" }));

    await waitFor(() =>
      expect(calls.some((call) => call.includes("/api/leaderboard") && call.includes("category=docs")))
        .toBe(true),
    );
  });

  it("asks for a time window when one is chosen", async () => {
    const { calls } = renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/leaderboard": { body: board([]) },
    });
    await openTab("Leaderboard");

    await userEvent.click(await screen.findByRole("button", { name: "This week" }));

    await waitFor(() =>
      expect(calls.some((call) => call.includes("/api/leaderboard") && call.includes("period=week")))
        .toBe(true),
    );
  });

  it("shows your own position when it falls outside the page", async () => {
    renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/leaderboard": {
        body: board(
          [{ rank: 1, github_login: "someone-else", avatar_url: null, points: 900, merges: 20 }],
          { me: { rank: 142, github_login: "octocat", avatar_url: null, points: 45, merges: 1 } },
        ),
      },
    });
    await openTab("Leaderboard");

    await screen.findByText("@someone-else");
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("is honestly empty, and never shows a demo entry", async () => {
    renderWorkspace({
      "/api/issues": { body: EMPTY_ISSUES },
      "/api/me/points": { body: POINTS },
      "/api/leaderboard": { body: board([]) },
    });
    await openTab("Leaderboard");

    expect(await screen.findByText(/No ranked contributors/)).toBeInTheDocument();
    expect(screen.queryByText(/maya-dev|jkoenig|openframe/)).not.toBeInTheDocument();
  });
});

// --- signed out ---------------------------------------------------------------

describe("workspace sign-in", () => {
  it.each([
    ["issues", "/explore"], ["maintain", "/maintainers"], ["leaderboard", "/leaderboard"],
  ] as const)("requires sign-in for %s and preserves its destination", async (initialView, destination) => {
    const navigation = captureNavigation();
    const { calls } = stubApi({"/api/me":{status:401,body:{}}});
    render(<AuthProvider><ContributorWorkspace initialView={initialView} /></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", {name:"Continue with GitHub"}));
    expect(navigation.assigned[0]).toContain(`/auth/github?next=${encodeURIComponent(destination)}`);
    expect(calls).toHaveLength(1);
    expect(screen.queryByRole("navigation", {name:"Dashboard"})).not.toBeInTheDocument();
  });
  it("reports failed identity lookup without exposing the workspace", async () => {
    stubApi({"/api/me":{status:503,body:{detail:"The database is not reachable right now."}}});
    render(<AuthProvider><ContributorWorkspace /></AuthProvider>);
    expect(await screen.findByText("The database is not reachable right now.")).toBeInTheDocument();
    expect(screen.getByRole("button", {name:"Retry connection"})).toBeInTheDocument();
    expect(screen.queryByRole("navigation", {name:"Dashboard"})).not.toBeInTheDocument();
  });
});


it("claims allocations with CSRF and refreshes the account", async () => {
  const onClaimed = vi.fn();
  const { fetchMock } = stubApi({
    "/api/csrf": { body: { csrf_token: "claim-csrf" } },
    "/api/me/claims": { body: { points: 40, items: [{ id: 1, kind: "bounty_award", points: 40, repository: "org/app", pr_number: 9 }], claimed_points: 40 } },
  });
  render(<ClaimPoints onClaimed={onClaimed} />);
  await userEvent.click(await screen.findByRole("button", { name: "Claim my points" }));
  expect(await screen.findByText("40 points claimed.")).toBeInTheDocument();
  const write = fetchMock.mock.calls.find(([, options]) => options?.method === "POST");
  expect(write?.[0]).toBe("http://localhost:8001/api/me/claims");
  expect(write?.[1]?.headers).toEqual({ "X-GitBounty-CSRF": "claim-csrf" });
  expect(onClaimed).toHaveBeenCalledOnce();
});
