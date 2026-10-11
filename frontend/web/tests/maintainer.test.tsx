/*
  The maintainer workspace: choosing a repository, choosing issues, validating a value, reviewing, and
  publishing. The point of these is the refusals -- a value outside the bounds must not be publishable
  from the UI any more than from the API.
*/
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MaintainerWorkspace } from "../app/components/MaintainerWorkspace";
import { stubApi } from "./helpers";

const repository = (overrides: Record<string, unknown> = {}) => ({
  full_name: "octocat/app", description: "A repository", owner_login: "octocat", owner_type: "User",
  private: false, language: "TypeScript", stargazers_count: 10, open_issues_count: 2,
  has_issues: true, permission: "admin", publishable: true, blocked_reason: null, ...overrides,
});

const repositoryList = (items: unknown[]) => ({
  items, page: 1, per_page: 30, total: items.length, has_more: false,
});

const issue = (overrides: Record<string, unknown> = {}) => ({
  repository: "octocat/app", repository_description: null, number: 12, title: "Keyboard navigation",
  html_url: "https://github.com/octocat/app/issues/12", labels: ["a11y"],
  suggested_category: "frontend", suggested_points: null, existing: null, ...overrides,
});

const issueList = (items: unknown[]) => ({
  items, page: 1, per_page: 30, total: items.length, has_more: false, repository: "octocat/app",
});

const EMPTY_BOUNTIES = { items: [], page: 1, per_page: 25, total: 0, has_more: false };

function renderMaintainer(routes: Parameters<typeof stubApi>[0]) {
  const stub = stubApi({ "/api/github-app": { body: { configured: false, install_url: null, repositories: [] } }, "/api/csrf": { body: { csrf_token: "a-csrf-token" } }, ...routes });
  render(<MaintainerWorkspace onPublished={() => {}} />);
  return stub;
}

// --- choosing a repository ----------------------------------------------------

describe("choosing a repository", () => {
  it("lists the repositories the API says you may publish on", async () => {
    renderMaintainer({
      "/api/maintainer/repositories": { body: repositoryList([repository()]) },
    });

    expect(await screen.findByRole("link", { name: "octocat/app" })).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose issues" })).toBeInTheDocument();
  });

  it("shows why a repository cannot carry a bounty rather than hiding it", async () => {
    renderMaintainer({
      "/api/maintainer/repositories": {
        body: repositoryList([repository({
          publishable: false,
          blocked_reason: "Private repositories are not supported yet.",
        })]),
      },
    });

    expect(await screen.findByText("Private repositories are not supported yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose issues" })).not.toBeInTheDocument();
  });

  it("explains an empty list in terms of the permission required", async () => {
    renderMaintainer({ "/api/maintainer/repositories": { body: repositoryList([]) } });

    expect(await screen.findByText("No repositories you can publish on.")).toBeInTheDocument();
    expect(screen.getByText(/admin or maintain permission/)).toBeInTheDocument();
  });

  it("asks the API for a search term", async () => {
    const { calls } = renderMaintainer({
      "/api/maintainer/repositories": { body: repositoryList([repository()]) },
    });
    await screen.findByRole("link", { name: "octocat/app" });

    await userEvent.type(screen.getByPlaceholderText("Search repositories"), "app");

    await waitFor(() =>
      expect(calls.some((call) => call.includes("/api/maintainer/repositories") && call.includes("q=app")))
        .toBe(true),
    );
  });

  it("reports a rate limit as a recoverable failure", async () => {
    renderMaintainer({
      "/api/maintainer/repositories": {
        status: 429, body: { detail: "GitHub's rate limit was reached. Try again shortly." },
      },
    });

    expect(await screen.findByText("Couldn’t continue.")).toBeInTheDocument();
    expect(screen.getByText(/rate limit was reached/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("reconnects rejected GitHub authorization instead of retrying the same credential", async () => {
    renderMaintainer({
      "/api/maintainer/repositories": { status: 401, body: { detail: "Sign in with GitHub again." } },
    });
    const reconnect = await screen.findByRole("link", { name: "Reconnect GitHub" });
    expect(reconnect).toHaveAttribute("href", "http://localhost:8001/auth/github?next=%2Fmaintainers");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("authorization is no longer valid");
  });
});

// --- choosing issues and publishing -------------------------------------------

async function chooseRepository(routes: Parameters<typeof stubApi>[0] = {}) {
  const stub = renderMaintainer({
    "/api/maintainer/repositories": { body: repositoryList([repository()]) },
    "/api/maintainer/repositories/octocat/app/issues": { body: issueList([issue()]) },
    ...routes,
  });
  await userEvent.click(await screen.findByRole("button", { name: "Choose issues" }));
  await screen.findByRole("link", { name: "Keyboard navigation" });
  return stub;
}

describe("choosing issues", () => {
  it("loads the chosen repository's open issues", async () => {
    await chooseRepository();

    expect(screen.getByText("octocat/app")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Keyboard navigation" })).toBeInTheDocument();
    expect(screen.getByText("Not published")).toBeInTheDocument();
  });

  it("pre-fills a gitbounty label's value as a suggestion", async () => {
    await chooseRepository({
      "/api/maintainer/repositories/octocat/app/issues": {
        body: issueList([issue({ suggested_points: 70, labels: ["gitbounty:70"] })]),
      },
    });

    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("spinbutton")).toHaveValue(70);
  });

  it("shows an existing bounty so a duplicate is never offered", async () => {
    await chooseRepository({
      "/api/maintainer/repositories/octocat/app/issues": {
        body: issueList([issue({
          existing: {
            repository: "octocat/app", issue_number: 12, points: 40, category: "frontend",
            status: "published", issue_title: null, issue_state: null, issue_url: null,
            set_by: "octocat", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
            awarded: false,
          },
        })]),
      },
    });

    expect(screen.getByText("40 pts published")).toBeInTheDocument();
  });
});

describe("validating a bounty value", () => {
  const select = async () => userEvent.click(screen.getByRole("checkbox"));

  it("will not let a selection be reviewed with no value", async () => {
    await chooseRepository();
    await select();

    expect(screen.getByRole("button", { name: /^Review/ })).toBeDisabled();
  });

  it.each([0, -5, 1001, 100000])("refuses %s", async (value) => {
    await chooseRepository();
    await select();

    await userEvent.type(screen.getByRole("spinbutton"), String(value));

    expect(screen.getByRole("button", { name: /^Review/ })).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/between 1 and 1,?000/);
  });

  it.each([1, 40, 1000])("accepts %s", async (value) => {
    await chooseRepository();
    await select();

    await userEvent.type(screen.getByRole("spinbutton"), String(value));

    expect(screen.getByRole("button", { name: /^Review/ })).toBeEnabled();
  });

  it("refuses a value that is not a whole number", async () => {
    await chooseRepository();
    await select();

    await userEvent.type(screen.getByRole("spinbutton"), "40.5");

    expect(screen.getByRole("button", { name: /^Review/ })).toBeDisabled();
  });
});

describe("publishing", () => {
  it("shows a preview before anything is sent", async () => {
    const { calls } = await chooseRepository();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.type(screen.getByRole("spinbutton"), "40");

    await userEvent.click(screen.getByRole("button", { name: /^Review/ }));

    expect(screen.getByRole("heading", { name: /Review 1 bounty/ })).toBeInTheDocument();
    // The preview line is split across elements, so match on the list item's own text.
    const [item] = within(screen.getByLabelText("Review before publishing")).getAllByRole("listitem");
    expect(item.textContent?.replace(/\s+/g, " ")).toContain("40 points · Frontend");
    expect(calls.some((call) => call.startsWith("POST"))).toBe(false);
  });

  it("publishes only the selected issue, with the CSRF header", async () => {
    const { calls, fetchMock } = await chooseRepository({
      "/api/maintainer/bounties": { body: { published: 1, repositories: 1 } },
    });
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.type(screen.getByRole("spinbutton"), "40");
    await userEvent.click(screen.getByRole("button", { name: /^Review/ }));

    await userEvent.click(screen.getByRole("button", { name: "Publish these bounties" }));

    await waitFor(() => expect(calls.some((call) => call.startsWith("POST") && call.includes("/api/maintainer/bounties"))).toBe(true));
    const publish = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes("/api/maintainer/bounties") && (init as RequestInit)?.method === "POST");
    const init = publish![1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-GitBounty-CSRF"]).toBe("a-csrf-token");
    expect(JSON.parse(String(init.body))).toEqual({
      issues: [{ repository: "octocat/app", number: 12, points: 40, category: "frontend" }],
    });
    expect(await screen.findByText(/1 bounty is now published/)).toBeInTheDocument();
  });

  it("reports a refusal from the API", async () => {
    await chooseRepository({
      "/api/maintainer/bounties": {
        status: 403, body: { detail: "You need admin or maintain permission on a repository." },
      },
    });
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.type(screen.getByRole("spinbutton"), "40");
    await userEvent.click(screen.getByRole("button", { name: /^Review/ }));
    await userEvent.click(screen.getByRole("button", { name: "Publish these bounties" }));

    expect(await screen.findByText(/You need admin or maintain permission/)).toBeInTheDocument();
  });
});

describe("managing what was published", () => {
  it("lists published bounties and says when one has been awarded", async () => {
    renderMaintainer({
      "/api/maintainer/repositories": { body: repositoryList([repository()]) },
      "/api/maintainer/bounties": {
        body: {
          ...EMPTY_BOUNTIES, total: 1,
          items: [{
            repository: "octocat/app", issue_number: 12, points: 40, category: "frontend",
            status: "published", issue_title: "Keyboard navigation", issue_state: "open",
            issue_url: "https://github.com/octocat/app/issues/12", set_by: "octocat",
            created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", awarded: true,
          }],
        },
      },
    });

    await userEvent.click(await screen.findByRole("tab", { name: "My published bounties" }));

    expect(await screen.findByRole("link", { name: "Keyboard navigation" })).toBeInTheDocument();
    expect(screen.getByText(/Already awarded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
  });

  it("is honestly empty before anything is published", async () => {
    renderMaintainer({
      "/api/maintainer/repositories": { body: repositoryList([repository()]) },
      "/api/maintainer/bounties": { body: EMPTY_BOUNTIES },
    });

    await userEvent.click(await screen.findByRole("tab", { name: "My published bounties" }));

    expect(await screen.findByText(/haven’t published any/)).toBeInTheDocument();
  });
});


it("links App installation and connects a selected repository with CSRF", async () => {
  const { fetchMock } = renderMaintainer({
    "/api/github-app": { body: { configured: true, install_url: "https://github.com/apps/gitbounty/installations/new", repositories: [] } },
    "/api/maintainer/repositories": { body: repositoryList([repository()]) },
    "/api/maintainer/repositories/octocat/app/connect": { body: { connected: true } },
  });
  expect(await screen.findByRole("link", { name: "Install GitHub App / select repositories" })).toHaveAttribute("href", "https://github.com/apps/gitbounty/installations/new");
  await userEvent.click(await screen.findByRole("button", { name: "Connect automatic rewards" }));
  expect(await screen.findByText("octocat/app connected for automatic rewards.")).toBeInTheDocument();
  const write = fetchMock.mock.calls.find(([, options]) => options?.method === "POST");
  expect(write?.[0]).toBe("http://localhost:8001/api/maintainer/repositories/octocat/app/connect");
  expect(write?.[1]?.headers).toHaveProperty("X-GitBounty-CSRF");
});
