-- 0005_merged_prs.sql
-- Creates: merged_prs — one row per merged pull request that has been counted.
-- Depends on: 0001_users.sql (foreign key to users.id).
--
-- Lifted from backend/dev/schema.sql, which is where this table was developed
-- against a local database. feature-seams.md seam 2 puts the numbered migration
-- on this side of the split, so this file is the version that gets applied and
-- dev/schema.sql stays the local-only copy.
--
-- A user's points total is summed from these rows rather than stored on users.
-- A sum cannot drift out of step with the rows it comes from, and at this size
-- it is fast. If it stops being fast, a stored total is the fix.

create table if not exists merged_prs (
    id             bigserial   primary key,
    user_id        bigint      not null references users (id) on delete cascade,

    -- GitHub's own id for the PR. With user_id this is what makes a re-sync
    -- idempotent: a PR already stored is a PR already counted, never twice.
    github_pr_id   bigint      not null,

    repo_full_name text        not null,
    number         integer     not null,
    title          text        not null,
    url            text        not null,
    merged_at      timestamptz not null,

    -- The shared category vocabulary (feature-seams.md seam 3). The check is
    -- deliberate: both halves of the product write categories, and a typo in
    -- one half would quietly split a leaderboard. Adding a category later needs
    -- a migration, which is the intended cost.
    category       text        not null
        check (category in ('frontend', 'backend', 'fullstack', 'docs',
                            'testing', 'devops', 'design', 'mobile', 'other')),

    -- The issue this PR closed, when it closed one. Kept so a contributor can
    -- be shown where their points came from.
    closed_issue_repo   text,
    closed_issue_number integer,

    -- What the issue creator allocated (null when no closed issue carried a
    -- value), and what the merge earned in total: the flat per-merge amount
    -- plus whatever was allocated.
    issue_points   integer,
    points         integer     not null check (points >= 0),

    counted_at     timestamptz not null default now(),

    unique (user_id, github_pr_id)
);

create index if not exists merged_prs_user_idx      on merged_prs (user_id);
create index if not exists merged_prs_merged_at_idx on merged_prs (merged_at desc);
create index if not exists merged_prs_category_idx  on merged_prs (category);
