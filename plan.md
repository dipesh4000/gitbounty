# Build plan

Five features, sized so one person can own one and just ask Claude Code to build it. Read
[`overview.md`](overview.md) first if you haven't — this plan is for the points/leaderboard version, not the
money/escrow one `readme.md` still describes.

## Before touching code: 2 things

1. **Tell your teammate.** GitBounty is now being built as a points/leaderboard app — no bounty money, no crypto
   wallet. That drops the money version your teammate has been designing the pitch deck and demo site around. Have
   that conversation before more code gets written on either side.
2. **Sync the git branches.** Local and `origin` have both moved since they last matched — pull the other side's
   changes in before starting new work.

## The 5 features

### 1. Auth — "Login with GitHub"
Users sign in with their GitHub account. No wallet, no password.
**Tell Claude Code:** "Add GitHub OAuth login" — it'll handle the redirect, the callback, and keeping someone logged in.

### 2. Backend — the server and the points
Everything that isn't a screen: the database, the API the website and extension talk to, and the logic that checks
GitHub for a person's merged pull requests and turns them into points.
**Tell Claude Code:** "Build the backend: FastAPI, a Postgres database (as a migration file in `migrations/`, see
its README), and an endpoint that syncs a logged-in user's merged PRs from GitHub and stores points for them."

Two things worth saying up front, so it gets built right the first time:
- We don't own the repos whose issues we list, so we can't ask every maintainer to install a webhook. Instead:
  check *each user's own* GitHub account for their merged PRs, using their own login, not a webhook.
- Don't award points for a PR someone merged into their own repo — that's the easy way to fake points.

### 3. Frontend — the website
The actual site: a login button, a page to browse open issues by category, a personal page showing your points, and
a leaderboard.
**Tell Claude Code:** "Build the website: login, browse issues by category, my points page, leaderboard." The
colours and fonts from the current demo ([`frontend/web/styles.css`](frontend/web/styles.css)) can be reused — the
layout and copy should be new, since the whole point of the app changed.

### 4. Extension — the Chrome badge
A small badge on GitHub's own issue pages, so people don't need to visit the website to see what's worth points. No
login needed for this one.
**Tell Claude Code:** "Build the Chrome extension described in
[`frontend/extension/README.md`](frontend/extension/README.md)" — that file already sketches what it should do.

### 5. Deploy — put it online
Get the backend and the website hosted somewhere real, not just running on a laptop for the demo.
**Tell Claude Code:** "Deploy the backend and website" once each works locally.

## Order that actually matters

1. Backend comes first for you — Auth partly lives inside it, and the Extension's badge needs a real backend
   endpoint to call, so building Backend → Auth → Extension in that order avoids redoing anything.
2. Your teammate's Frontend can start against placeholder data without waiting on your backend — wire it to the
   real API once yours is up.
3. Deploy happens as each piece is ready, not all at the end.
