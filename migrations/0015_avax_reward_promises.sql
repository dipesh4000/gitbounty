-- Adds immutable owner-funded AVAX promises; no retroactive money for existing awards.
-- Depends on: 0013_reward_allocations.sql and 0007_bounty_lifecycle.sql.
create table if not exists avax_reward_terms (
    bounty_id bigint primary key references issue_points(id),
    payer_github_id bigint not null references users(github_id),
    amount_wei numeric(78,0) not null check (amount_wei > 0 and amount_wei < power(10::numeric, 78)),
    created_at timestamptz not null default now()
);

-- A reservation is evidence of eligibility, not evidence of payment.
create table if not exists avax_reward_claims (
    allocation_id bigint primary key references reward_allocations(id),
    bounty_id bigint not null references avax_reward_terms(bounty_id),
    github_id bigint not null,
    payer_github_id bigint not null references users(github_id),
    amount_wei numeric(78,0) not null check (amount_wei > 0),
    review_status text not null default 'clear' check (review_status in ('clear', 'under_review')),
    claimed_at timestamptz,
    created_at timestamptz not null default now()
);

create or replace function immutable_avax_reward_terms() returns trigger language plpgsql as $$
begin
    raise exception 'Published AVAX reward terms are immutable';
end;
$$;
create or replace trigger avax_terms_immutable before update or delete on avax_reward_terms
    for each row execute function immutable_avax_reward_terms();

create or replace function reserve_avax_reward() returns trigger language plpgsql as $$
begin
    if new.kind = 'bounty_award' then
        insert into avax_reward_claims (allocation_id, bounty_id, github_id, payer_github_id, amount_wei)
        select new.id, t.bounty_id, new.github_id, t.payer_github_id, t.amount_wei
        from avax_reward_terms t join issue_points b on b.id = t.bounty_id
        where lower(b.repo_full_name) = lower(new.bounty_repo_full_name)
          and b.issue_number = new.bounty_issue_number;
    end if;
    return new;
end;
$$;
create or replace trigger reserve_avax_reward after insert on reward_allocations
    for each row execute function reserve_avax_reward();

create table if not exists wallet_challenges (
    github_id bigint primary key references users(github_id),
    message text not null,
    expires_at timestamptz not null
);
create table if not exists wallets (
    github_id bigint primary key references users(github_id),
    address text not null unique check (address ~ '^0x[0-9a-f]{40}$'),
    created_at timestamptz not null default now()
);
create or replace trigger wallets_immutable before update or delete on wallets
    for each row execute function immutable_avax_reward_terms();

create table if not exists avax_payments (
    claim_id bigint primary key references avax_reward_claims(allocation_id),
    chain_id integer not null check (chain_id = 43114),
    sender text not null references wallets(address),
    recipient text not null references wallets(address),
    nonce bigint not null check (nonce >= 0),
    status text not null default 'awaiting_signature'
        check (status in ('awaiting_signature', 'submitted', 'paid', 'failed')),
    tx_hash text unique check (tx_hash ~ '^0x[0-9a-f]{64}$'),
    created_at timestamptz not null default now(),
    paid_at timestamptz,
    unique (chain_id, sender, nonce)
);

create or replace function immutable_avax_claim_identity() returns trigger language plpgsql as $$
begin
    if (new.allocation_id, new.bounty_id, new.github_id, new.payer_github_id, new.amount_wei)
       is distinct from (old.allocation_id, old.bounty_id, old.github_id, old.payer_github_id, old.amount_wei) then
        raise exception 'AVAX claim identity and amount are immutable';
    end if;
    return new;
end;
$$;
create or replace trigger avax_claim_immutable before update on avax_reward_claims
    for each row execute function immutable_avax_claim_identity();

create table if not exists avax_payment_receipts (
    tx_hash text primary key,
    claim_id bigint not null references avax_reward_claims(allocation_id),
    nonce bigint not null,
    status text not null check (status in ('paid', 'failed')),
    verified_at timestamptz not null default now()
);
create or replace trigger avax_receipts_immutable before update or delete on avax_payment_receipts
    for each row execute function immutable_avax_reward_terms();
