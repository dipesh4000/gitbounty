import { FAKE_GITHUB_URL, MAINTAINER, REPO } from "../config";

/** Everything the fake GitHub will serve, as the test sets it. */
export type GithubState = {
  repositories?: unknown[];
  issues?: unknown[];
  pulls?: unknown[];
  reviews?: Record<string, unknown[]>;
  files?: Record<string, unknown[]>;
};

export async function setGithubState(state: GithubState) {
  const response = await fetch(`${FAKE_GITHUB_URL}/__control__/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error(`could not set the fake GitHub state: ${response.status}`);
}

export const repository = (overrides: Record<string, unknown> = {}) => ({
  id: 777001,
  full_name: REPO,
  name: "widgets",
  private: false,
  archived: false,
  owner: { login: MAINTAINER.github_login, type: "User" },
  permissions: { admin: true, maintain: true, push: true },
  language: "TypeScript",
  description: "A repository used by the end-to-end test",
  stargazers_count: 12,
  created_at: "2026-01-01T00:00:00Z",
  has_issues: true,
  open_issues_count: 2,
  ...overrides,
});

export const issue = (number: number, title: string, overrides: Record<string, unknown> = {}) => ({
  id: 800000 + number,
  number,
  title,
  html_url: `https://github.com/${REPO}/issues/${number}`,
  labels: [{ name: "a11y" }],
  comments: 0,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
  ...overrides,
});

/** One pull request as GitHub's search endpoint returns it. */
export const pull = (
  number: number,
  {
    author,
    title = "Fix focus order in the filter chips",
    body = "",
    draft = false,
    state = "open",
    mergedAt = null as string | null,
    closedAt = null as string | null,
    repo = REPO,
  }: {
    author: string;
    title?: string;
    body?: string;
    draft?: boolean;
    state?: "open" | "closed";
    mergedAt?: string | null;
    closedAt?: string | null;
    repo?: string;
  },
) => ({
  id: 700000 + number,
  number,
  title,
  html_url: `https://github.com/${repo}/pull/${number}`,
  repository_url: `${FAKE_GITHUB_URL}/repos/${repo}`,
  user: { login: author },
  labels: [],
  body,
  draft,
  state,
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-21T00:00:00Z",
  closed_at: closedAt,
  pull_request: { merged_at: mergedAt },
});

export const review = (login: string, state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED") => ({
  user: { login },
  state,
});
