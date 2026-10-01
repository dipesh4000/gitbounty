-- 0007_bounty_lifecycle.sql
-- Changes: issue_points gains a lifecycle status and a bounded points range;
--          issue_points_history records every change to a bounty;
--          issues records where its category came from.
-- Depends on: 0004_published_bounties.sql (issue_points) and 0003_issues.sql (issues).
--
-- Three things were missing.
--
-- 1. A published bounty was permanent. There was no way for a maintainer to
--    unpublish or archive one, so a bounty on an issue that had been closed,
--    renamed or abandoned stayed in the public explorer forever.
--
-- 2. The points value was unbounded: the only constraint was `points > 0`, and
--    backend/app/features/points/rules.py said so explicitly ("A creator's
--    value is NOT capped ... it is also the known way to cheat"). A number is
--    now bounded in the database as well as in the API, because a bound that
--    only one of the two enforces is not a bound.
--
-- 3. Nothing recorded who changed a bounty, when, or from what. Every points
--    change must have traceable provenance, and that starts with the bounty.
--
-- Nothing here drops a column or deletes a row. The existing check constraint on
-- points is replaced by a bounded one; any row already outside 1..1000 would
-- make this fail rather than be silently truncated, which is the intended
-- behaviour -- it needs a human decision, not a migration.

alter table issue_points
    add column if not exists status text not null default 'published';

alter table issue_points drop constraint if exists issue_points_status_check;
alter table issue_points add constraint issue_points_status_check
    check (status in ('published', 'unpublished', 'archived'));

-- The bounded range. 1000 is the documented maximum for one bounty; see
-- docs/points-rules.md. Changing it is a migration, deliberately: an unbounded
-- or quietly-raised ceiling is the difference between a reputation score and a
-- number anybody can mint.
alter table issue_points drop constraint if exists issue_points_points_check;
alter table issue_points add constraint issue_points_points_check
    check (points >= 1 and points <= 1000);

create index if not exists issue_points_status_idx
    on issue_points (status, updated_at desc);

-- Every change to a bounty, append-only. Written by the maintainer endpoints in
-- the same transaction as the change itself.
create table if not exists issue_points_history (
    id              bigserial   primary key,
    repo_full_name  text        not null,
    issue_number    integer     not null,
    action          text        not null,
    points_before   integer,
    points_after    integer,
    status_before   text,
    status_after    text,
    category_before text,
    category_after  text,
    -- The authenticated maintainer who made the change. Kept even if their user
    -- row is later removed, because the history has to stay readable.
    actor_user_id   bigint      references users (id) on delete set null,
    actor_login     text        not null,
    reason          text        not null default '',
    created_at      timestamptz not null default now(),

    constraint issue_points_history_action_check
        check (action in ('published', 'repriced', 'recategorised', 'unpublished', 'republished', 'archived'))
);

create index if not exists issue_points_history_issue_idx
    on issue_points_history (repo_full_name, issue_number, created_at desc);

create index if not exists issue_points_history_actor_idx
    on issue_points_history (actor_user_id, created_at desc);

-- Where an issue's category came from. A maintainer's choice is authoritative
-- for a published bounty; automated inference may only fill in a blank, never
-- overwrite 'maintainer'.
alter table issues
    add column if not exists category_source text not null default 'inferred';

alter table issues drop constraint if exists issues_category_source_check;
alter table issues add constraint issues_category_source_check
    check (category_source in ('maintainer', 'inferred'));
