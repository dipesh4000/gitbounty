/*
  TEMPORARY, hard-coded sign-in.

  Real GitHub sign-in (`/auth/github`) is waiting on the GitHub OAuth app, so while DEMO_CONNECT is true
  the "Connect GitHub" buttons behave as if the visitor had connected as DEMO_GITHUB_LOGIN and take them
  straight to the workspace. Nothing here talks to GitHub or the backend, and no token or secret is involved.

  To go back to the real flow, set DEMO_CONNECT to false. To remove all of this, delete this file and the
  three places that import it (AuthProvider.tsx and api.ts).

  A real session always wins: the demo user is only used when the backend says nobody is signed in, and the
  hard-coded responses below are only used when the real request fails.
*/
import type { LeaderboardResponse, MyPointsResponse, User } from "./api";

export const DEMO_CONNECT = true;
export const DEMO_GITHUB_LOGIN = "aastha-malik";

const STORAGE_KEY = "gitbounty-demo-session";

export const DEMO_USER: User = {
  id: 0,
  github_id: 0,
  github_login: DEMO_GITHUB_LOGIN,
  name: "Aastha Malik",
  avatar_url: `https://github.com/${DEMO_GITHUB_LOGIN}.png`,
};

// Whether the signed-in user is the hard-coded one. Set by AuthProvider, read by api().
let demoActive = false;
export function setDemoActive(value: boolean) { demoActive = value; }

function storage() {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function demoSessionStarted() { return DEMO_CONNECT && storage()?.getItem(STORAGE_KEY) === "1"; }
export function startDemoSession() { storage()?.setItem(STORAGE_KEY, "1"); }
export function endDemoSession() { storage()?.removeItem(STORAGE_KEY); setDemoActive(false); }

/*
  What the workspace shows for the demo user when the real endpoint can't answer: a new account with no
  points and no ranked contributors. These are empty states, not invented achievements.
*/
export function demoResponse<T>(path: string): T | undefined {
  if (!demoActive) return undefined;
  if (path.startsWith("/api/me/points")) {
    const points: MyPointsResponse = {
      github_login: DEMO_GITHUB_LOGIN,
      total_points: 0,
      week_points: 0,
      total_merges: 0,
      points_by_category: {},
      recent_merges: [],
    };
    return points as T;
  }
  if (path.startsWith("/api/leaderboard")) {
    const leaderboard: LeaderboardResponse = { period: "all", category: null, entries: [] };
    return leaderboard as T;
  }
  return undefined;
}
