-- 0003_issues.sql
-- Creates: issues — the browsable list of open GitHub issues.
-- Depends on: 0002_repositories.sql (foreign key to repositories.id).
--
-- These rows are a cache of GitHub's issue search, refreshed by the backend's
-- sync job. GitHub's search API allows only 30 requests per minute, so the site
-- reads from this table and never calls the search API on a page load.
--
-- category is one of: frontend, backend, fullstack, docs. It is derived from the
-- repo language and the issue's labels (see backend/app/categories.py).

create table if not exists issues (
    id               bigserial   primary key,
    github_id        bigint      not null unique,
    repository_id    bigint      not null references repositories (id) on delete cascade,
    number           integer     not null,
    title            text        not null,
    html_url         text        not null,
    state            text        not null default 'open',
    category         text        not null default 'fullstack',
    language         text,
    labels           text[]      not null default '{}',
    comments_count   integer     not null default 0,
    issue_created_at timestamptz,
    issue_updated_at timestamptz,
    fetched_at       timestamptz not null default now(),

    constraint issues_repo_number_key unique (repository_id, number),
    constraint issues_category_check
        check (category in ('frontend', 'backend', 'fullstack', 'docs'))
);

create index if not exists issues_browse_idx
    on issues (state, category, issue_updated_at desc);

create index if not exists issues_language_idx
    on issues (lower(language));

-- Free-text search over the issue title, used by the search box on the board.
create index if not exists issues_title_search_idx
    on issues using gin (to_tsvector('english', title));
