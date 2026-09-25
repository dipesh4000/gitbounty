-- GitBounty schema -- PROPOSED, and NOT a migration.
--
-- The database schema is Nishika's feature and the real Supabase project is hers, so the numbered migration in
-- ../../migrations/ is hers to write and apply (see ../../migrations/README.md and ../../feature-seams.md seam 2).
-- This file exists so Aastha's features can run against a local database before that happens, and so the SQL
-- Nishika applies is the same SQL that has actually been run rather than a retyped copy.
--
-- To use locally:
--   docker exec -i gitbounty_dev_db psql -U gitbounty -d gitbounty_dev < dev/schema.sql
--
-- Safe to run repeatedly: it creates nothing that already exists. It drops nothing.

-- Who has signed in. Owned by the GitHub Login feature (Nishika's); Aastha's code only reads it.
create table if not exists users (
    id          bigserial primary key,
    -- GitHub's numeric id, not the login: a person can rename their account and the login follows them.
    github_id   bigint      not null unique,
    github_login text       not null,
    name         text,
    avatar_url  text,
    -- OAuth tokens are Fernet-encrypted by backend/app/crypto.py before storage.
    github_access_token text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    last_login_at timestamptz
);

-- Keep older local databases compatible with Nishika's OAuth migration.
alter table users add column if not exists name text;
alter table users add column if not exists github_access_token text;
alter table users add column if not exists updated_at timestamptz not null default now();
alter table users add column if not exists last_login_at timestamptz;

-- One row per merged pull request that has been counted for a user.
create table if not exists merged_prs (
    id            bigserial primary key,
    user_id       bigint      not null references users (id) on delete cascade,

    -- GitHub's own id for the PR. Together with user_id this is what makes a re-sync idempotent: a PR already
    -- stored is a PR already counted, and is never awarded twice.
    github_pr_id  bigint      not null,

    repo_full_name text       not null,
    number         integer    not null,
    title          text       not null,
    url            text       not null,
    merged_at      timestamptz not null,

    -- The shared category vocabulary (feature-seams.md, seam 3). The check constraint is deliberate: both halves
    -- of the product write categories, and a typo in one half would quietly split a leaderboard. Adding a
    -- category later therefore needs a migration, which is the intended cost.
    category       text       not null
        check (category in ('frontend', 'backend', 'fullstack', 'docs',
                            'testing', 'devops', 'design', 'mobile', 'other')),

    -- The issue this PR closed, when it closed one. Kept for showing a contributor where their points came from.
    closed_issue_repo   text,
    closed_issue_number integer,

    -- What the issue creator allocated (null when no closed issue carried a value), and what the merge earned
    -- in total: the flat per-merge amount plus whatever was allocated.
    issue_points  integer,
    points        integer     not null check (points >= 0),

    counted_at    timestamptz not null default now(),

    unique (user_id, github_pr_id)
);

create index if not exists merged_prs_user_idx      on merged_prs (user_id);
create index if not exists merged_prs_merged_at_idx on merged_prs (merged_at desc);
create index if not exists merged_prs_category_idx  on merged_prs (category);

-- A points value set by a signed-in maintainer on the GitBounty website (feature-seams.md, seam 4).
-- Written by Nishika's maintainer screen; read by Aastha's award code, where it beats a GitHub label.
create table if not exists issue_points (
    id             bigserial primary key,
    repo_full_name text        not null,
    issue_number   integer     not null,
    points         integer     not null check (points > 0),
    set_by_user_id bigint      not null references users (id) on delete cascade,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),

    unique (repo_full_name, issue_number)
);

create index if not exists issue_points_set_by_user_idx
    on issue_points (set_by_user_id, updated_at desc);

-- A user's total is summed from merged_prs rather than stored on users. Summing cannot drift out of step with
-- the rows it comes from, and at this size it is fast. If it ever stops being fast, a stored total is the fix.
