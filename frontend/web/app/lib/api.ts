/*
  Every call to the GitBounty API.

  Two things this module is strict about. There is no fallback to canned data: a failure is reported as a
  failure so a caller can show the real reason. And every state-changing request carries the CSRF token the
  backend mints at sign-in, because the session is a cookie and a cookie is attached to a cross-site form
  post whether the user meant it or not.
*/

export const API_BASE = (process.env.NEXT_PUBLIC_GITBOUNTY_API || "http://localhost:8001").replace(/\/+$/, "");

const CSRF_HEADER = "X-GitBounty-CSRF";

export const CATEGORIES = [
  "frontend", "backend", "fullstack", "docs", "testing", "devops", "design", "mobile", "other",
] as const;

export type BountyCategory = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<BountyCategory, string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Full-stack",
  docs: "Docs",
  testing: "Testing",
  devops: "DevOps",
  design: "Design",
  mobile: "Mobile",
  other: "Other",
};

export function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value as BountyCategory] ?? value;
}

// --- shapes ---------------------------------------------------------------

export type Issue = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  category: string;
  language: string | null;
  labels: string[];
  comments_count: number;
  issue_created_at: string | null;
  issue_updated_at: string | null;
  repository: string;
  repository_description: string | null;
  stars: number;
  points: number;
  posted_by: string | null;
};

export type IssueList = {
  items: Issue[];
  page: number;
  per_page: number;
  sort: "updated" | "stars";
  has_more: boolean;
};

export type User = {
  id: number;
  github_id: number;
  github_login: string;
  name: string | null;
  avatar_url: string | null;
};

export type SyncStatus = {
  state: "never" | "running" | "succeeded" | "failed";
  started_at: string | null;
  finished_at: string | null;
  prs_seen: number;
  self_merges_skipped: number;
  newly_counted: number;
  points_awarded: number;
  error: string | null;
  retry_after_seconds: number | null;
};

export type MergeSummary = {
  github_pr_id: number;
  repo_full_name: string;
  number: number;
  title: string;
  url: string;
  category: BountyCategory;
  merged_at: string;
  bounty_repo_full_name: string | null;
  bounty_issue_number: number | null;
  bounty_points: number | null;
  points: number;
};

export const PR_STATES = [
  "draft", "open", "in_review", "changes_requested", "approved", "merged", "closed_unmerged",
] as const;

export type PullRequestState = (typeof PR_STATES)[number];

export const PR_STATE_LABELS: Record<PullRequestState, string> = {
  draft: "Draft",
  open: "Open",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  merged: "Merged",
  closed_unmerged: "Closed",
};

export type TrackedPullRequest = {
  github_pr_id: number;
  repo_full_name: string;
  number: number;
  title: string;
  url: string;
  state: PullRequestState;
  is_draft: boolean;
  category: BountyCategory;
  category_source: "maintainer" | "inferred";
  bounty_repo_full_name: string | null;
  bounty_issue_number: number | null;
  bounty_points: number | null;
  baseline_eligible: boolean;
  eligible: boolean;
  ineligible_reason: string | null;
  /** What this would earn if merged as it stands. A forecast: a bounty is awarded once, to one person. */
  expected_points: number;
  /** What the ledger has actually credited. */
  awarded_points: number;
  pr_created_at: string | null;
  pr_updated_at: string | null;
  merged_at: string | null;
  closed_at: string | null;
};

export type PullRequestList = {
  github_login: string;
  items: TrackedPullRequest[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
  counts: Partial<Record<PullRequestState, number>>;
  sync: SyncStatus;
};

export type MyPointsResponse = {
  github_login: string;
  total_points: number;
  week_points: number;
  total_merges: number;
  points_by_category: Partial<Record<BountyCategory, number>>;
  recent_merges: MergeSummary[];
  sync: SyncStatus;
};

export type PointsRules = {
  rule_version: string;
  baseline_per_merge: number;
  min_bounty_points: number;
  max_bounty_points: number;
};

export type LedgerEntry = {
  id: number;
  kind: "bounty_award" | "baseline_award" | "adjustment" | "void";
  points: number;
  category: BountyCategory;
  category_source: "maintainer" | "inferred";
  rule_version: string;
  reason: string;
  pr_repo_full_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  bounty_repo_full_name: string | null;
  bounty_issue_number: number | null;
  bounty_points_at_award: number | null;
  merged_at: string | null;
  created_at: string;
};

export type PointsHistoryResponse = {
  github_login: string;
  total_points: number;
  entries: LedgerEntry[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
  rules: PointsRules;
};

export type LeaderboardEntry = {
  rank: number;
  github_login: string;
  avatar_url: string | null;
  points: number;
  merges: number;
};

export type LeaderboardResponse = {
  period: LeaderboardPeriod;
  category: BountyCategory | null;
  entries: LeaderboardEntry[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
  me: LeaderboardEntry | null;
};

export type LeaderboardPeriod = "all" | "week" | "month";

export type MaintainerRepository = {
  full_name: string;
  description: string | null;
  owner_login: string;
  owner_type: string | null;
  private: boolean;
  language: string | null;
  stargazers_count: number;
  open_issues_count: number;
  has_issues: boolean;
  permission: "admin" | "maintain" | "owner";
  publishable: boolean;
  blocked_reason: string | null;
};

export type MaintainerRepositoryList = {
  items: MaintainerRepository[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
};

export type PublishedBounty = {
  repository: string;
  issue_number: number;
  points: number;
  category: BountyCategory;
  status: BountyStatus;
  issue_title: string | null;
  issue_state: string | null;
  issue_url: string | null;
  set_by: string | null;
  created_at: string;
  updated_at: string;
  awarded: boolean;
};

export type BountyStatus = "published" | "unpublished" | "archived";

export type RepositoryIssue = {
  repository: string;
  repository_description: string | null;
  number: number;
  title: string;
  html_url: string;
  labels: string[];
  suggested_category: BountyCategory;
  suggested_points: number | null;
  existing: PublishedBounty | null;
};

export type RepositoryIssueList = {
  items: RepositoryIssue[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
  repository: string;
};

export type BountyList = {
  items: PublishedBounty[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
};

export type BountyHistoryEntry = {
  action: string;
  points_before: number | null;
  points_after: number | null;
  status_before: string | null;
  status_after: string | null;
  category_before: string | null;
  category_after: string | null;
  actor_login: string;
  reason: string;
  created_at: string;
};

export type BountyHistoryResponse = {
  repository: string;
  issue_number: number;
  entries: BountyHistoryEntry[];
};

export type SyncStartedResponse = {
  state: "running" | "already-running";
  message: string;
};

// --- the client -----------------------------------------------------------

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Read of the API. Never falls back to canned data; a failure throws an ApiError. */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options });
  } catch {
    // fetch only rejects for network-level problems: the API is not running, or CORS refused the call.
    throw new ApiError(`Could not reach the GitBounty API at ${API_BASE}.`, 0);
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json() as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // The status message still describes a non-JSON response.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/*
  The CSRF token, fetched once and remembered for the page's lifetime. It is minted when the session is
  created and does not change, so re-fetching it per request would be a wasted round trip. A 403 from a
  write clears it, so a stale value recovers on the next attempt rather than wedging the UI.
*/
let csrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const { csrf_token } = await api<{ csrf_token: string }>("/api/csrf");
  csrfToken = csrf_token;
  return csrf_token;
}

/** Write to the API, carrying the CSRF token. Use for every POST, PATCH and DELETE. */
export async function apiWrite<T>(
  path: string,
  { method = "POST", body }: { method?: "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const send = async (token: string) => api<T>(path, {
    method,
    headers: {
      [CSRF_HEADER]: token,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  try {
    return await send(await getCsrfToken());
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      // The token may belong to a session that has since been replaced. Try once with a fresh one.
      csrfToken = null;
      return send(await getCsrfToken());
    }
    throw error;
  }
}

export function forgetCsrfToken() {
  csrfToken = null;
}

// --- formatting -----------------------------------------------------------

export function formatStars(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value ?? 0);
}

export function formatPoints(value: number) {
  return value.toLocaleString("en-US");
}

export function timeAgo(iso: string | null) {
  if (!iso) return "";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 0) return "just now";
  const units: Array<[string, number]> = [
    ["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60],
  ];
  for (const [suffix, size] of units) {
    const amount = Math.floor(seconds / size);
    if (amount >= 1) return `${amount}${suffix} ago`;
  }
  return "just now";
}
