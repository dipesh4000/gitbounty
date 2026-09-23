-- 0002_repositories.sql
-- Creates: repositories — cached metadata for any repo we show an issue from.
-- Depends on: 0001_users.sql (ordering only; no foreign key between them).
--
-- Why this table exists at all: GitHub's issue search does not return the repo's
-- star count, age or owner type, but the anti-farming rules in overview.md need
-- all three (no points for your own repos, or for repos below a minimum age and
-- popularity). Caching them here keeps us well inside GitHub's rate limits.

create table if not exists repositories (
    id               bigserial   primary key,
    github_id        bigint      not null unique,
    full_name        text        not null unique,
    owner_login      text        not null,
    owner_type       text,
    primary_language text,
    description      text,
    stargazers_count integer     not null default 0,
    repo_created_at  timestamptz,
    fetched_at       timestamptz not null default now()
);

create index if not exists repositories_owner_login_lower_idx
    on repositories (lower(owner_login));

create index if not exists repositories_stars_idx
    on repositories (stargazers_count desc);
