-- 0011_pull_requests.sql
-- Creates: pull_requests — every pull request a user has authored, in whatever state it is in.
-- Depends on: 0001_users.sql (foreign key to users.id).
--
-- Until now GitBounty only knew about *merged* pull requests: the sync searched
-- `is:pr author:X is:merged` and merged_prs was the only table. So "My PRs"
-- could show nothing but merged work while describing itself as "track the work
-- you have submitted", and a contributor with an open pull request against a
-- published bounty saw an empty page.
--
-- This table is a **cache of GitHub**, not a ledger. Unlike points_ledger it is
-- deliberately mutable: a pull request's state is whatever GitHub says it is
-- today, and re-syncing overwrites it. Nothing here is evidence of an award --
-- points_ledger remains the only record of that, and merged_prs remains the
-- record of which merges have been counted.
--
-- `state` is derived from what GitHub actually reports, never guessed:
--
--   draft              the pull request is marked draft
--   open               open, not draft, and nobody has reviewed it
--   in_review          open, and there is at least one review that neither
--                      approved nor requested changes (a plain comment review)
--   changes_requested  a reviewer's most recent review requests changes
--   approved           at least one approval and no outstanding change request
--   merged             GitHub reports a merged_at
--   closed_unmerged    closed with no merged_at
--
-- `eligible` and `ineligible_reason` record whether this pull request could earn
-- anything and, when it could not, why -- in words a contributor can read.

create table if not exists pull_requests (
    id              bigserial   primary key,
    user_id         bigint      not null references users (id) on delete cascade,

    -- GitHub's own immutable id for the pull request. With user_id this is what
    -- makes a re-sync update a row rather than create a second one, and it is
    -- what joins this table to merged_prs and points_ledger.
    github_pr_id    bigint      not null,

    repo_full_name  text        not null,
    number          integer     not null,
    title           text        not null,
    url             text        not null,
    author_login    text        not null,

    state           text        not null,
    is_draft        boolean     not null default false,

    category        text        not null,
    category_source text        not null default 'inferred',

    -- The published bounty this pull request closes, if it closes one, and what
    -- that bounty is worth *now*. What was actually awarded lives in the ledger;
    -- these two can differ, and the UI shows both as "expected" and "awarded".
    bounty_repo_full_name text,
    bounty_issue_number   integer,
    bounty_points         integer,
    baseline_eligible     boolean not null default false,

    eligible          boolean not null default false,
    ineligible_reason text,

    pr_created_at   timestamptz,
    pr_updated_at   timestamptz,
    merged_at       timestamptz,
    closed_at       timestamptz,

    first_seen_at   timestamptz not null default now(),
    last_synced_at  timestamptz not null default now(),

    constraint pull_requests_state_check
        check (state in ('draft', 'open', 'in_review', 'changes_requested',
                         'approved', 'merged', 'closed_unmerged')),
    constraint pull_requests_category_check
        check (category in ('frontend', 'backend', 'fullstack', 'docs',
                            'testing', 'devops', 'design', 'mobile', 'other')),
    constraint pull_requests_category_source_check
        check (category_source in ('maintainer', 'inferred')),
    -- A merged pull request has a merge time; one that is not merged does not.
    constraint pull_requests_merged_at_check
        check ((state = 'merged') = (merged_at is not null)),
    -- An ineligible pull request says why. "Ineligible, with no reason" is not an
    -- answer a contributor can do anything with.
    constraint pull_requests_reason_check
        check (eligible or ineligible_reason is not null),

    unique (user_id, github_pr_id)
);

create index if not exists pull_requests_user_idx
    on pull_requests (user_id, pr_updated_at desc nulls last);

create index if not exists pull_requests_state_idx
    on pull_requests (user_id, state);

-- "Is there a pull request for this bounty?", for the maintainer's view of one.
create index if not exists pull_requests_bounty_idx
    on pull_requests (lower(bounty_repo_full_name), bounty_issue_number);
