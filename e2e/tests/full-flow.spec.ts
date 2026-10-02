import { expect, test } from "@playwright/test";

import { API_URL, CONTRIBUTOR, MAINTAINER, REPO, WEB_URL } from "../config";
import { issue, pull, repository, review, setGithubState } from "./github";
import { signIn, syncAndWait } from "./session";

/*
  One journey, end to end, against the real backend, a real Postgres and the production build of the
  website. Only github.com is substituted, by a local HTTP server the backend talks to over a socket.

  Maintainer: sign in, choose a repository, choose an issue, set a value, review, publish.
  Then: the bounty appears in the public explorer.
  Contributor: sign in, open a pull request, watch it move through its states, merge it.
  Then: exactly one award, the points total updates, and the category leaderboard updates.
*/

const BOUNTY_ISSUE = 12;
const BOUNTY_POINTS = 40;
const BASELINE = 5;
const PR_NUMBER = 77;

test.describe.configure({ mode: "serial" });

test("a bounty is published, worked on, merged, and awarded exactly once", async ({ browser }) => {
  // ---------------------------------------------------------------- the maintainer publishes

  await setGithubState({
    repositories: [repository()],
    issues: [
      issue(BOUNTY_ISSUE, "Keyboard navigation skips the filter chips"),
      issue(18, "Document the sync cursor"),
    ],
    pulls: [],
    reviews: {},
    files: {},
  });

  const maintainerContext = await browser.newContext();
  await signIn(maintainerContext, MAINTAINER);
  const maintainer = await maintainerContext.newPage();

  await maintainer.goto(`${WEB_URL}/explore`);
  await expect(maintainer.getByRole("heading", { name: "Opportunities" })).toBeVisible();

  await test.step("choose a repository", async () => {
    await maintainer.getByRole("button", { name: "My repositories" }).click();
    await expect(maintainer.getByRole("link", { name: REPO })).toBeVisible();
    await maintainer.getByRole("button", { name: "Choose issues" }).click();
  });

  await test.step("choose an issue and give it a value", async () => {
    const row = maintainer.locator(".app-table-row", {
      has: maintainer.getByRole("link", { name: "Keyboard navigation skips the filter chips" }),
    });
    await expect(row).toBeVisible();
    await row.getByRole("checkbox").check();
    await row.getByRole("spinbutton").fill(String(BOUNTY_POINTS));
    await row.getByRole("combobox").selectOption("frontend");
  });

  await test.step("review before publishing", async () => {
    await maintainer.getByRole("button", { name: /^Review/ }).click();
    await expect(maintainer.getByRole("heading", { name: /Review 1 bounty/ })).toBeVisible();
    await expect(maintainer.getByRole("listitem").first())
      .toContainText(`${BOUNTY_POINTS} points`);
  });

  await test.step("publish", async () => {
    await maintainer.getByRole("button", { name: "Publish these bounties" }).click();
    await expect(maintainer.getByText(/1 bounty is now published/)).toBeVisible();
  });

  // ---------------------------------------------------------------- it appears in the explorer

  await test.step("the bounty is in the public opportunity explorer", async () => {
    // Public: checked without a session at all, as a visitor would see it.
    const anonymous = await browser.newContext();
    const issues = await (await anonymous.request.get(`${API_URL}/api/issues`)).json();
    expect(issues.items).toHaveLength(1);
    expect(issues.items[0]).toMatchObject({
      number: BOUNTY_ISSUE,
      points: BOUNTY_POINTS,
      category: "frontend",
      repository: REPO,
      posted_by: MAINTAINER.github_login,
    });

    const visitor = await anonymous.newPage();
    await visitor.goto(WEB_URL);
    await expect(visitor.getByText("Keyboard navigation skips the filter chips")).toBeVisible();
    await anonymous.close();
  });

  await maintainerContext.close();

  // ---------------------------------------------------------------- the contributor's lifecycle

  const contributorContext = await browser.newContext();
  const { csrf_token: csrf } = await signIn(contributorContext, CONTRIBUTOR);
  const contributor = await contributorContext.newPage();
  const api = contributorContext.request;

  const closingBody = `Fixes the focus trap.\n\nCloses #${BOUNTY_ISSUE}`;
  const asContributor = (overrides: Parameters<typeof pull>[1]) =>
    pull(PR_NUMBER, { author: CONTRIBUTOR.github_login, body: closingBody, ...overrides });

  await test.step("a draft earns nothing", async () => {
    await setGithubState({ pulls: [asContributor({ draft: true })], reviews: {}, files: {} });
    const points = await syncAndWait(api, csrf, { full: true });
    expect(points.total_points).toBe(0);

    const list = await (await api.get(`${API_URL}/api/me/pull-requests`)).json();
    expect(list.items[0].state).toBe("draft");
    expect(list.items[0].awarded_points).toBe(0);
    expect(list.items[0].expected_points).toBe(BOUNTY_POINTS + BASELINE);
  });

  await test.step("review states move, and still earn nothing", async () => {
    for (const [reviews, expected] of [
      [[review("reviewer", "COMMENTED")], "in_review"],
      [[review("reviewer", "CHANGES_REQUESTED")], "changes_requested"],
      [[review("reviewer", "CHANGES_REQUESTED"), review("reviewer", "APPROVED")], "approved"],
    ] as const) {
      await setGithubState({
        pulls: [asContributor({})],
        reviews: { [String(PR_NUMBER)]: reviews as unknown[] },
        files: {},
      });
      const points = await syncAndWait(api, csrf, { full: true });
      const list = await (await api.get(`${API_URL}/api/me/pull-requests`)).json();
      expect(list.items[0].state, `after ${JSON.stringify(reviews)}`).toBe(expected);
      expect(points.total_points, "approval is not a merge").toBe(0);
    }
  });

  await test.step("the merge awards the bounty and the baseline, once", async () => {
    await setGithubState({
      pulls: [asContributor({ state: "closed", mergedAt: "2026-09-25T12:00:00Z" })],
      reviews: {},
      files: { [String(PR_NUMBER)]: [{ filename: "src/components/Filters.tsx" }] },
    });
    const points = await syncAndWait(api, csrf, { full: true });

    expect(points.total_points).toBe(BOUNTY_POINTS + BASELINE);
    expect(points.total_merges).toBe(1);

    const history = await (await api.get(`${API_URL}/api/me/points/history`)).json();
    expect(history.total).toBe(2);
    expect(history.entries.map((entry: { kind: string }) => entry.kind).sort())
      .toEqual(["baseline_award", "bounty_award"]);
    const award = history.entries.find((entry: { kind: string }) => entry.kind === "bounty_award");
    expect(award).toMatchObject({
      points: BOUNTY_POINTS,
      bounty_repo_full_name: REPO,
      bounty_issue_number: BOUNTY_ISSUE,
      bounty_points_at_award: BOUNTY_POINTS,
      category: "frontend",
      category_source: "maintainer",
      rule_version: "points-v1",
    });
  });

  await test.step("syncing again awards nothing further", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const points = await syncAndWait(api, csrf, { full: true });
      expect(points.total_points, `after sync ${attempt + 2}`).toBe(BOUNTY_POINTS + BASELINE);
    }
    const history = await (await api.get(`${API_URL}/api/me/points/history`)).json();
    expect(history.total, "exactly two ledger entries, however often we sync").toBe(2);
  });

  // ---------------------------------------------------------------- what the contributor sees

  await test.step("the website shows the merged pull request and the points", async () => {
    await contributor.goto(`${WEB_URL}/explore`);
    await contributor.getByRole("button", { name: "My PRs" }).click();

    const row = contributor.locator(".app-table-row", {
      has: contributor.getByRole("link", { name: "Fix focus order in the filter chips" }),
    });
    await expect(row).toBeVisible();
    await expect(row.locator(".app-status")).toHaveText("Merged");
    await expect(row).toContainText("awarded");
    await expect(row).toContainText(String(BOUNTY_POINTS + BASELINE));

    await expect(contributor.locator(".app-nav-points")).toContainText(String(BOUNTY_POINTS + BASELINE));
  });

  await test.step("the points history explains both entries", async () => {
    await contributor.getByRole("button", { name: "Points" }).click();
    const history = contributor.locator(".app-history-table");
    await expect(history).toBeVisible();
    await expect(history.getByText("Bounty", { exact: true })).toBeVisible();
    await expect(history.getByText("Baseline", { exact: true })).toBeVisible();
    // The bounty entry names the bounty and what it was worth at the time.
    await expect(history).toContainText(`${REPO}#${BOUNTY_ISSUE} · worth ${BOUNTY_POINTS} at the time`);
    // The rule version is reported alongside the table, in the summary line.
    await expect(contributor.getByText(/Rules points-v1/)).toBeVisible();
  });

  await test.step("the category leaderboard updates", async () => {
    const overall = await (await api.get(`${API_URL}/api/leaderboard`)).json();
    expect(overall.entries).toHaveLength(1);
    expect(overall.entries[0]).toMatchObject({
      rank: 1,
      github_login: CONTRIBUTOR.github_login,
      points: BOUNTY_POINTS + BASELINE,
      merges: 1,
    });

    const frontend = await (await api.get(`${API_URL}/api/leaderboard?category=frontend`)).json();
    expect(frontend.entries[0].points).toBe(BOUNTY_POINTS + BASELINE);

    const docs = await (await api.get(`${API_URL}/api/leaderboard?category=docs`)).json();
    expect(docs.entries, "the award belongs to one category, not all of them").toHaveLength(0);

    await contributor.getByRole("button", { name: "Leaderboard" }).click();
    await expect(contributor.locator(".app-leaderboard-table"))
      .toContainText(`@${CONTRIBUTOR.github_login}`);
  });

  await contributorContext.close();
});

test("a second contributor cannot be awarded the same bounty", async ({ browser }) => {
  const OTHER = { github_id: 900003, github_login: "e2e-latecomer" };

  const context = await browser.newContext();
  const { csrf_token: csrf } = await signIn(context, OTHER);

  await setGithubState({
    pulls: [pull(88, {
      author: OTHER.github_login,
      body: `Also closes #${BOUNTY_ISSUE}`,
      state: "closed",
      mergedAt: "2026-09-26T12:00:00Z",
    })],
    reviews: {},
    files: {},
  });

  const points = await syncAndWait(context.request, csrf, { full: true });

  // The bounty was already awarded to somebody else; only the baseline is left.
  expect(points.total_points).toBe(5);
  const history = await (await context.request.get(`${API_URL}/api/me/points/history`)).json();
  expect(history.entries.map((entry: { kind: string }) => entry.kind)).toEqual(["baseline_award"]);

  await context.close();
});

test("the test sign-in path is the only way in, and it needs the secret", async ({ browser }) => {
  const context = await browser.newContext();

  const noHeader = await context.request.post(`${API_URL}/test-auth/session`, {
    data: { github_id: 1, github_login: "nobody" },
  });
  expect(noHeader.status(), "no secret: not even an admission that the path exists").toBe(404);

  const wrongHeader = await context.request.post(`${API_URL}/test-auth/session`, {
    headers: { "X-GitBounty-Test-Auth": "not-the-secret" },
    data: { github_id: 1, github_login: "nobody" },
  });
  expect(wrongHeader.status()).toBe(404);

  const me = await context.request.get(`${API_URL}/api/me`);
  expect(me.status(), "and nothing was signed in along the way").toBe(401);

  await context.close();
});
