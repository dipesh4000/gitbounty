-- Creates: the Fuji escrow reward records, evidence, vouchers, attempts and event cursor.
-- Depends on: 0016_fuji_usdc.sql and 0014_github_app.sql.
-- Legacy promises and receipts remain immutable audit history; escrow never reuses amount_wei.

alter table issue_points add column if not exists reward_mode text not null default 'points_only';
update issue_points ip set reward_mode = 'legacy_payment'
where exists (select 1 from avax_reward_terms legacy where legacy.bounty_id = ip.id);
alter table issue_points drop constraint if exists issue_points_reward_mode_check;
alter table issue_points add constraint issue_points_reward_mode_check
    check (reward_mode in ('points_only', 'legacy_payment', 'escrow'));

create table if not exists escrow_reward_terms (
    bounty_id bigint primary key references issue_points(id),
    chain_id integer not null check (chain_id = 43113),
    contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
    token_address text not null check (token_address ~ '^0x[0-9a-f]{40}$'),
    reference_id text not null unique check (reference_id ~ '^0x[0-9a-f]{64}$'),
    onchain_bounty_id text not null check (onchain_bounty_id ~ '^0x[0-9a-f]{64}$'),
    repository_github_id bigint not null,
    issue_github_id bigint not null unique,
    payer_github_id bigint not null references users(github_id),
    payer_address text not null check (payer_address ~ '^0x[0-9a-f]{40}$'),
    amount_units numeric(78,0) not null check (amount_units > 0 and amount_units < power(10::numeric, 78)),
    work_ends_at timestamptz not null,
    claim_until timestamptz not null,
    created_at timestamptz not null default now(),
    unique (chain_id, contract_address, onchain_bounty_id),
    check (claim_until = work_ends_at + interval '7 days')
);

create table if not exists escrow_funding_events (
    bounty_id bigint primary key references escrow_reward_terms(bounty_id),
    tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
    log_index integer not null check (log_index >= 0),
    block_number bigint not null check (block_number >= 0),
    block_hash text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
    block_time timestamptz not null,
    payer_address text not null check (payer_address ~ '^0x[0-9a-f]{40}$'),
    token_address text not null check (token_address ~ '^0x[0-9a-f]{40}$'),
    amount_units numeric(78,0) not null check (amount_units > 0),
    funded_at timestamptz not null,
    verified_at timestamptz not null default now(),
    unique (tx_hash, log_index)
);

create table if not exists escrow_allocations (
    allocation_id bigint primary key references reward_allocations(id),
    bounty_id bigint not null unique references escrow_reward_terms(bounty_id),
    author_github_id bigint not null,
    github_pr_id bigint not null,
    repository_github_id bigint not null,
    issue_github_id bigint not null,
    merged_at timestamptz not null,
    closing_reference text not null,
    pr_snapshot jsonb not null,
    closed_event_id text not null,
    closed_event_at timestamptz not null,
    eligibility_snapshot jsonb not null,
    rule_version text not null default 'escrow-v1',
    created_at timestamptz not null default now(),
    unique (bounty_id, github_pr_id)
);
create index if not exists escrow_allocations_author on escrow_allocations(author_github_id, created_at desc);

create table if not exists escrow_recipient_bindings (
    allocation_id bigint primary key references escrow_allocations(allocation_id),
    recipient text not null check (recipient ~ '^0x[0-9a-f]{40}$'),
    bound_at timestamptz not null default now()
);

create table if not exists escrow_vouchers (
    id bigserial primary key,
    allocation_id bigint not null references escrow_recipient_bindings(allocation_id),
    recipient text not null check (recipient ~ '^0x[0-9a-f]{40}$'),
    typed_data jsonb not null,
    digest text not null unique check (digest ~ '^0x[0-9a-f]{64}$'),
    signature text not null check (signature ~ '^0x[0-9a-f]{130}$'),
    nonce numeric(78,0) not null check (nonce = 0),
    deadline timestamptz not null,
    status text not null default 'live' check (status in ('live', 'expired', 'used')),
    created_at timestamptz not null default now()
);
create unique index if not exists escrow_vouchers_one_live
    on escrow_vouchers(allocation_id) where status = 'live';

create table if not exists escrow_chain_attempts (
    id bigserial primary key,
    bounty_id bigint not null references escrow_reward_terms(bounty_id),
    kind text not null check (kind in ('approval', 'fund', 'settle', 'refund')),
    execution_mode text not null check (execution_mode in ('direct', 'aa')),
    userop_hash text check (userop_hash is null or userop_hash ~ '^0x[0-9a-f]{64}$'),
    tx_hash text check (tx_hash is null or tx_hash ~ '^0x[0-9a-f]{64}$'),
    status text not null check (status in ('awaiting_signature', 'submitted', 'unknown', 'failed', 'verified')),
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists escrow_attempts_userop_unique
    on escrow_chain_attempts(userop_hash) where userop_hash is not null;

create table if not exists escrow_chain_events (
    chain_id integer not null check (chain_id = 43113),
    contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
    tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
    log_index integer not null check (log_index >= 0),
    event_name text not null check (event_name in ('BountyFunded', 'BountySettled', 'BountyRefunded')),
    onchain_bounty_id text not null check (onchain_bounty_id ~ '^0x[0-9a-f]{64}$'),
    block_number bigint not null check (block_number >= 0),
    block_hash text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
    block_time timestamptz not null,
    event_data jsonb not null,
    observed_at timestamptz not null default now(),
    primary key (chain_id, tx_hash, log_index)
);

create table if not exists escrow_index_cursors (
    chain_id integer not null check (chain_id = 43113),
    contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
    deployment_block bigint not null check (deployment_block >= 0),
    last_block_number bigint not null check (last_block_number >= deployment_block),
    last_block_hash text check (last_block_hash is null or last_block_hash ~ '^0x[0-9a-f]{64}$'),
    updated_at timestamptz not null default now(),
    primary key (chain_id, contract_address)
);

create or replace function guard_reward_mode() returns trigger language plpgsql as $$
begin
    if new.reward_mode is distinct from old.reward_mode and (
        exists (select 1 from avax_reward_terms where bounty_id = old.id) or
        exists (select 1 from escrow_reward_terms where bounty_id = old.id)
    ) then
        raise exception 'Published reward mode is immutable';
    end if;
    return new;
end;
$$;
create or replace trigger issue_points_reward_mode_immutable before update on issue_points
    for each row execute function guard_reward_mode();

create or replace function guard_legacy_reward_path() returns trigger language plpgsql as $$
begin
    if exists (select 1 from escrow_reward_terms where bounty_id = new.bounty_id) or
       (select reward_mode from issue_points where id = new.bounty_id) <> 'legacy_payment' then
        raise exception 'Bounty is not in legacy payment mode';
    end if;
    return new;
end;
$$;
create or replace trigger avax_terms_one_payment_path before insert on avax_reward_terms
    for each row execute function guard_legacy_reward_path();

create or replace function guard_escrow_reward_path() returns trigger language plpgsql as $$
begin
    if exists (select 1 from avax_reward_terms where bounty_id = new.bounty_id) or
       (select reward_mode from issue_points where id = new.bounty_id) <> 'escrow' then
        raise exception 'Bounty is not in escrow mode';
    end if;
    return new;
end;
$$;
create or replace trigger escrow_terms_one_payment_path before insert on escrow_reward_terms
    for each row execute function guard_escrow_reward_path();

create or replace function verify_escrow_funding_evidence() returns trigger language plpgsql as $$
declare terms escrow_reward_terms%rowtype;
begin
    select * into terms from escrow_reward_terms where bounty_id = new.bounty_id;
    if not found or new.payer_address <> terms.payer_address or
       new.token_address <> terms.token_address or new.amount_units <> terms.amount_units or
       new.funded_at <> new.block_time or new.funded_at >= terms.work_ends_at then
        raise exception 'Funding evidence does not match frozen escrow terms';
    end if;
    return new;
end;
$$;
create or replace trigger escrow_funding_matches_terms before insert on escrow_funding_events
    for each row execute function verify_escrow_funding_evidence();

create or replace function verify_escrow_allocation() returns trigger language plpgsql as $$
declare allocation reward_allocations%rowtype;
declare terms escrow_reward_terms%rowtype;
declare funding escrow_funding_events%rowtype;
declare issue issue_points%rowtype;
begin
    select * into allocation from reward_allocations where id = new.allocation_id for update;
    select * into terms from escrow_reward_terms where bounty_id = new.bounty_id;
    select * into funding from escrow_funding_events where bounty_id = new.bounty_id;
    select * into issue from issue_points where id = new.bounty_id;
    if allocation.kind <> 'bounty_award' or allocation.github_id <> new.author_github_id or
       allocation.github_pr_id <> new.github_pr_id or
       lower(allocation.bounty_repo_full_name) <> lower(issue.repo_full_name) or
       allocation.bounty_issue_number <> issue.issue_number or
       terms.repository_github_id <> new.repository_github_id or
       terms.issue_github_id <> new.issue_github_id or funding.bounty_id is null or
       new.merged_at < funding.funded_at or new.merged_at >= terms.work_ends_at then
        raise exception 'Escrow allocation does not match funded eligibility';
    end if;
    return new;
end;
$$;
create or replace trigger escrow_allocation_matches_eligibility before insert on escrow_allocations
    for each row execute function verify_escrow_allocation();

create or replace function verify_escrow_voucher() returns trigger language plpgsql as $$
declare bound_recipient text;
declare claim_deadline timestamptz;
begin
    select binding.recipient, terms.claim_until into bound_recipient, claim_deadline
    from escrow_recipient_bindings binding
    join escrow_allocations allocation on allocation.allocation_id = binding.allocation_id
    join escrow_reward_terms terms on terms.bounty_id = allocation.bounty_id
    where binding.allocation_id = new.allocation_id;
    if not found or new.recipient <> bound_recipient or new.deadline > claim_deadline then
        raise exception 'Voucher does not match frozen recipient or claim deadline';
    end if;
    return new;
end;
$$;
create or replace trigger escrow_voucher_matches_binding before insert on escrow_vouchers
    for each row execute function verify_escrow_voucher();

create or replace function immutable_escrow_voucher_identity() returns trigger language plpgsql as $$
begin
    if (new.allocation_id, new.recipient, new.typed_data, new.digest, new.signature, new.nonce, new.deadline, new.created_at)
       is distinct from
       (old.allocation_id, old.recipient, old.typed_data, old.digest, old.signature, old.nonce, old.deadline, old.created_at) then
        raise exception 'Escrow voucher identity is immutable';
    end if;
    return new;
end;
$$;
create or replace trigger escrow_voucher_identity_immutable before update on escrow_vouchers
    for each row execute function immutable_escrow_voucher_identity();

create or replace trigger escrow_terms_immutable before update or delete on escrow_reward_terms
    for each row execute function immutable_avax_reward_terms();
create or replace trigger escrow_funding_immutable before update or delete on escrow_funding_events
    for each row execute function immutable_avax_reward_terms();
create or replace trigger escrow_allocation_immutable before update or delete on escrow_allocations
    for each row execute function immutable_avax_reward_terms();
create or replace trigger escrow_recipient_immutable before update or delete on escrow_recipient_bindings
    for each row execute function immutable_avax_reward_terms();
create or replace trigger escrow_events_immutable before update or delete on escrow_chain_events
    for each row execute function immutable_avax_reward_terms();
