-- 0012_moderation_flags.sql
-- Creates: moderation_flags — reports of abuse, and what a moderator did about them.
-- Depends on: 0001_users.sql (users) and 0008_points_ledger.sql (the award a flag may point at).
--
-- docs/points-rules.md says plainly that collusion between two cooperating
-- accounts is not defended against. Nothing here detects it either. What this
-- adds is the ability to *act* once a person has noticed: record the concern,
-- review it, and correct the ledger in a way that leaves both the original
-- award and the correction readable.
--
-- Deliberately small. There is no admin dashboard, no queue, no assignment, no
-- audit of the audit. One table and three endpoints.
--
-- The rule it exists to protect: **a resolution never edits or deletes a
-- historical award.** Withdrawing points writes a new `void` entry in
-- points_ledger with the negation of the original value and a reason, and
-- `resolution_ledger_entry_id` points at it. Both rows stay, so the history
-- shows what happened and that it was undone.

create table if not exists moderation_flags (
    id             bigserial   primary key,

    -- What is being reported. Exactly one of these is set, enforced below.
    --   bounty       a published bounty, by repository and issue number
    --   pull_request a contribution, by the reporter-visible pull request
    --   ledger_entry one award
    subject_kind   text        not null,

    bounty_repo_full_name text,
    bounty_issue_number   integer,
    github_pr_id          bigint,
    ledger_entry_id       bigint references points_ledger (id) on delete set null,

    reason         text        not null,

    -- Who reported it. Kept even if their user row goes, because a report's
    -- provenance is part of the record.
    reporter_user_id bigint    references users (id) on delete set null,
    reporter_login   text      not null,

    status         text        not null default 'open',

    -- Who resolved it, when, how, and why.
    moderator_user_id bigint   references users (id) on delete set null,
    moderator_login   text,
    resolution        text,
    resolution_reason text,
    resolved_at       timestamptz,

    -- The corrective ledger entry, when one was written. Never a reference to
    -- an edited row -- there are none.
    resolution_ledger_entry_id bigint references points_ledger (id) on delete set null,

    created_at     timestamptz not null default now(),

    constraint moderation_flags_subject_kind_check
        check (subject_kind in ('bounty', 'pull_request', 'ledger_entry')),
    constraint moderation_flags_status_check
        check (status in ('open', 'upheld', 'dismissed')),
    constraint moderation_flags_resolution_check
        check (resolution is null or resolution in ('dismissed', 'upheld', 'award_withdrawn')),
    -- A report without a reason is not a report.
    constraint moderation_flags_reason_check
        check (length(trim(reason)) > 0),
    -- A resolution says who made it, when, and why.
    constraint moderation_flags_resolved_check
        check (
            status = 'open'
            or (moderator_login is not null
                and resolved_at is not null
                and resolution is not null
                and length(trim(coalesce(resolution_reason, ''))) > 0)
        ),
    -- The subject must actually be identified.
    constraint moderation_flags_subject_check
        check (
            (subject_kind = 'bounty'
             and bounty_repo_full_name is not null and bounty_issue_number is not null)
            or (subject_kind = 'pull_request' and github_pr_id is not null)
            or (subject_kind = 'ledger_entry' and ledger_entry_id is not null)
        )
);

create index if not exists moderation_flags_status_idx
    on moderation_flags (status, created_at desc);

create index if not exists moderation_flags_subject_idx
    on moderation_flags (subject_kind, lower(bounty_repo_full_name), bounty_issue_number);

create index if not exists moderation_flags_reporter_idx
    on moderation_flags (reporter_user_id, created_at desc);
