-- 0004_published_bounties.sql
-- Creates the maintainer-set bounty ledger and expands issue categories.
-- Depends on: 0001_users.sql and 0003_issues.sql.
--
-- Only issues with a row in issue_points are published on GitBounty. The
-- points value is stored here rather than on the GitHub issue so the signed-in
-- maintainer can correct it without changing the repository itself.

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

alter table issues drop constraint if exists issues_category_check;

alter table issues add constraint issues_category_check
    check (category in (
        'frontend', 'backend', 'fullstack', 'docs', 'testing',
        'devops', 'design', 'mobile', 'other'
    ));
