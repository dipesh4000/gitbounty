export const API_BASE = (process.env.NEXT_PUBLIC_GITBOUNTY_API || "http://localhost:8001").replace(/\/+$/, "");

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

export type CategoryCounts = {
  frontend: number;
  backend: number;
  fullstack: number;
  docs: number;
  testing: number;
  devops: number;
  design: number;
  mobile: number;
  other: number;
};

export type BountyCategory = "frontend" | "backend" | "fullstack" | "docs" | "testing" | "devops" | "design" | "mobile" | "other";

export type OwnedRepositoryIssue = {
  repository: string;
  repository_description: string | null;
  number: number;
  title: string;
  html_url: string;
  labels: string[];
  suggested_category: BountyCategory;
};

export type OwnedIssuesResponse = {
  items: OwnedRepositoryIssue[];
  repository_count: number;
  truncated: boolean;
};

export type PublishBountiesResponse = {
  published: number;
  repositories: number;
};

export type User = {
  id: number;
  github_id: number;
  github_login: string;
  name: string | null;
  avatar_url: string | null;
};

export type MergeSummary = {
  repo_full_name: string;
  number: number;
  title: string;
  url: string;
  category: BountyCategory;
  merged_at: string;
  issue_points: number | null;
  points: number;
};

export type MyPointsResponse = {
  github_login: string;
  total_points: number;
  week_points: number;
  total_merges: number;
  points_by_category: Partial<Record<BountyCategory, number>>;
  recent_merges: MergeSummary[];
};

export type LeaderboardEntry = {
  rank: number;
  github_login: string;
  avatar_url: string | null;
  points: number;
  merges: number;
};

export type LeaderboardResponse = {
  period: "all" | "week" | "month";
  category: BountyCategory | null;
  entries: LeaderboardEntry[];
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options });
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
  return response.json() as Promise<T>;
}

export function formatStars(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value ?? 0);
}

export function timeAgo(iso: string | null) {
  if (!iso) return "";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const units: Array<[string, number]> = [
    ["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60],
  ];
  for (const [suffix, size] of units) {
    const amount = Math.floor(seconds / size);
    if (amount >= 1) return `${amount}${suffix} ago`;
  }
  return "just now";
}
