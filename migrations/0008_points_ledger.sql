-- 0008_points_ledger.sql
-- Creates: points_ledger — the append-only record every points total is summed from.
-- Depends on: 0001_users.sql (users) and 0005_merged_prs.sql (merged_prs exists
--             alongside it; there is no foreign key between them, because a
--             ledger entry must survive a merged_prs row being re-synced).
--
-- Why this table exists.
--
-- Totals were summed from merged_prs, and merged_prs rows were updated in place:
--
--     on conflict (user_id, github_pr_id) do update
--        set points = excluded.points, ...
--      where excluded.points > merged_prs.points
--
-- That has three problems. A re-sync could raise a past award with no record of
-- the change; it could never lower one, so an over-award was uncorrectable; and
-- nothing anywhere said *why* a total was what it was. A reputation score whose
-- history can be rewritten is not evidence of anything.
--
-- Every entry here is immutable. A correction is a new entry with a negative
-- value, never an edit. A total is `sum(points)` over a user's entries, so it
-- can always be explained by listing them.
--
-- The two unique indexes are the whole anti-double-award mechanism, enforced by
-- the database rather than by application logic:
--
--   points_ledger_baseline_once  one baseline per pull request per person.
--   points_ledger_bounty_once    one bounty award per published bounty, ever,
--                                to anybody. A second pull request closing the
--                                same bounty cannot be awarded again, and two
--                                people cannot both be paid for one bounty.
--
-- rule_version is stored on every row so that a change to the rules does not
-- make old awards unexplainable.

create table if not exists points_ledger (
    id             bigserial   primary key,
    user_id        bigint      not null references users (id) on delete cascade,

    -- What kind of entry this is.
    --   bounty_award   the value a maintainer published on an issue
    --   baseline_award the flat per-merge amount
    --   adjustment     a correction, positive or negative, with a reason
    --   void           an award withdrawn by moderation; points is the negation
    kind           text        not null,

    -- Signed on purpose: a correction is a negative entry, not a smaller edit.
    points         integer     not null,

    category       text        not null,
    -- Whether `category` is the maintainer's choice or was inferred from the
    -- pull request's files.
    category_source text       not null default 'inferred',

    -- Which version of the rules produced this entry (docs/points-rules.md).
    rule_version   text        not null,
    -- Free text, shown in the points history. Never empty for an adjustment.
    reason         text        not null default '',

    -- Provenance: the pull request.
    github_pr_id       bigint,
    pr_repo_full_name  text,
    pr_number          integer,
    pr_author_login    text,
    merged_at          timestamptz,

    -- Provenance: the published bounty, and the maintainer who published it.
    bounty_repo_full_name  text,
    bounty_issue_number    integer,
    bounty_points_at_award integer,
    maintainer_user_id     bigint references users (id) on delete set null,

    created_at     timestamptz not null default now(),

    constraint points_ledger_kind_check
        check (kind in ('bounty_award', 'baseline_award', 'adjustment', 'void')),
    constraint points_ledger_category_check
        check (category in ('frontend', 'backend', 'fullstack', 'docs',
                            'testing', 'devops', 'design', 'mobile', 'other')),
    constraint points_ledger_category_source_check
        check (category_source in ('maintainer', 'inferred')),
    -- An award is never negative and never zero; only a correction may be.
    constraint points_ledger_award_sign_check
        check (kind not in ('bounty_award', 'baseline_award') or points > 0),
    -- An award always says which pull request earned it.
    constraint points_ledger_award_provenance_check
        check (kind not in ('bounty_award', 'baseline_award') or github_pr_id is not null),
    -- A bounty award always says which bounty, and what it was worth at the time.
    constraint points_ledger_bounty_provenance_check
        check (kind <> 'bounty_award'
               or (bounty_repo_full_name is not null
                   and bounty_issue_number is not null
                   and bounty_points_at_award is not null)),
    -- A correction without a reason is not a correction, it is a mystery.
    constraint points_ledger_reason_check
        check (kind not in ('adjustment', 'void') or length(trim(reason)) > 0)
);

-- One baseline per pull request per person.
create unique index if not exists points_ledger_baseline_once
    on points_ledger (user_id, github_pr_id)
    where kind = 'baseline_award';

-- One bounty award per published bounty, to anybody, ever.
create unique index if not exists points_ledger_bounty_once
    on points_ledger (lower(bounty_repo_full_name), bounty_issue_number)
    where kind = 'bounty_award';

-- A user's own history, newest first.
create index if not exists points_ledger_user_idx
    on points_ledger (user_id, created_at desc);

-- The leaderboards: overall, per period, and per category.
create index if not exists points_ledger_merged_at_idx
    on points_ledger (merged_at desc);

create index if not exists points_ledger_category_merged_at_idx
    on points_ledger (category, merged_at desc);

-- "What has this pull request earned?", for the My PRs view.
create index if not exists points_ledger_pr_idx
    on points_ledger (github_pr_id);
