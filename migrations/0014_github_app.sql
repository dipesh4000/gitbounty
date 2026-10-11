-- Creates: connected_repositories and a durable webhook inbox.
-- Depends on: 0001_users.sql and 0013_reward_allocations.sql.
create table if not exists connected_repositories (
    github_id bigint primary key,
    full_name text not null,
    installation_id bigint not null,
    connected_by bigint not null references users(id),
    active boolean not null default true
);
create table if not exists webhook_deliveries (
    delivery_id uuid primary key,
    event text not null,
    payload jsonb not null,
    status text not null default 'pending' check (status in ('pending', 'failed', 'processed', 'ignored')),
    attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    error text,
    received_at timestamptz not null default now(),
    processed_at timestamptz
);
create index if not exists webhook_deliveries_pending
    on webhook_deliveries(next_attempt_at) where status in ('pending', 'failed');
