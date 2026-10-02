-- 0009_sync_runs.sql
-- Creates: sync_runs — one row per GitHub synchronisation attempt.
-- Depends on: 0001_users.sql (foreign key to users.id).
--
-- POST /api/me/sync existed but nothing recorded that it had ever run, so the
-- website could not show a last-synced time, could not say whether a sync was in
-- progress, and could not distinguish "you have no merged pull requests" from
-- "we have never looked" or "the last attempt hit GitHub's rate limit". All
-- three looked identical: an empty table.
--
-- A row is inserted when a sync starts and updated once when it finishes. The
-- partial unique index means one user cannot have two syncs running at once,
-- which is also what makes a double-clicked Sync button harmless.

create table if not exists sync_runs (
    id             bigserial   primary key,
    user_id        bigint      not null references users (id) on delete cascade,

    status         text        not null default 'running',
    started_at     timestamptz not null default now(),
    finished_at    timestamptz,

    -- What the run saw and did, for the UI and for support questions.
    prs_seen            integer not null default 0,
    self_merges_skipped integer not null default 0,
    newly_counted       integer not null default 0,
    points_awarded      integer not null default 0,

    -- The newest merged_at this run observed. The starting point for an
    -- incremental sync, so a large history does not have to be re-walked.
    cursor_merged_at    timestamptz,

    -- Why it failed, in words safe to show a user. Never a token or a URL with
    -- credentials in it.
    error          text,
    -- Set when the failure was GitHub's rate limit, so the UI can say "try again
    -- in N seconds" rather than "something went wrong".
    retry_after_seconds integer,

    constraint sync_runs_status_check
        check (status in ('running', 'succeeded', 'failed')),
    constraint sync_runs_finished_check
        check ((status = 'running') = (finished_at is null))
);

create index if not exists sync_runs_user_idx
    on sync_runs (user_id, started_at desc);

-- At most one run in progress per user.
create unique index if not exists sync_runs_one_running_per_user
    on sync_runs (user_id)
    where status = 'running';
