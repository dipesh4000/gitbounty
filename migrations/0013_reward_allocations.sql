-- Creates: reward_allocations, reserving rewards before registration.
-- Depends on: 0008_points_ledger.sql and 0005_merged_prs.sql.
-- Existing ledger entries are copied as claimed reservations, never changed.
create table if not exists reward_allocations (
    id bigserial primary key,
    github_id bigint not null,
    github_pr_id bigint not null,
    kind text not null check (kind in ('baseline_award', 'bounty_award')),
    bounty_repo_full_name text,
    bounty_issue_number integer,
    award jsonb not null,
    ledger_entry_id bigint references points_ledger(id),
    created_at timestamptz not null default now(),
    unique (github_id, github_pr_id, kind),
    check (kind <> 'bounty_award' or
           (bounty_repo_full_name is not null and bounty_issue_number is not null))
);
create unique index if not exists reward_allocations_bounty_once
    on reward_allocations (lower(bounty_repo_full_name), bounty_issue_number)
    where kind = 'bounty_award';
create index if not exists reward_allocations_pending
    on reward_allocations (github_id) where ledger_entry_id is null;

insert into reward_allocations
    (github_id, github_pr_id, kind, bounty_repo_full_name, bounty_issue_number, award, ledger_entry_id)
select u.github_id, l.github_pr_id, l.kind, l.bounty_repo_full_name, l.bounty_issue_number,
       to_jsonb(l) || jsonb_build_object('title', m.title, 'url', m.url), l.id
from points_ledger l
join users u on u.id = l.user_id
left join merged_prs m on m.user_id = l.user_id and m.github_pr_id = l.github_pr_id
where l.kind in ('baseline_award', 'bounty_award')
on conflict do nothing;
