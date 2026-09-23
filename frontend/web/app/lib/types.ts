export const CATEGORIES = [
  "frontend",
  "backend",
  "fullstack",
  "docs",
  "testing",
  "devops",
  "design",
  "mobile",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Period = "all" | "month" | "week";

export type LeaderboardEntry = {
  rank: number;
  github_login: string;
  avatar_url: string | null;
  points: number;
  merges: number;
};

export type LeaderboardResponse = {
  period: Period;
  category: Category | null;
  entries: LeaderboardEntry[];
};

export type MeResponse = {
  github_login: string;
  github_id: number;
  is_dev_stub: boolean;
};

export type MergeSummary = {
  repo_full_name: string;
  number: number;
  title: string;
  url: string;
  category: Category;
  merged_at: string;
  issue_points: number | null;
  points: number;
};

export type MyPointsResponse = {
  github_login: string;
  total_points: number;
  total_merges: number;
  points_by_category: Record<string, number>;
  recent_merges: MergeSummary[];
};

export type SyncResponse = {
  github_login: string;
  newly_counted: number;
  updated: number;
  self_merges_skipped: number;
  total_points: number;
  total_merges: number;
};
