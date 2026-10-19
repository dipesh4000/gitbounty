-- Durable SmoothSend execution and smart-account ownership. Depends on 0018.
create table managed_smart_accounts (
    github_id bigint primary key references managed_wallet_keys(github_id),
    address text not null unique,
    factory text not null,
    paymaster text not null,
    created_at timestamptz not null default now()
);
create trigger managed_smart_accounts_immutable before update or delete on managed_smart_accounts
    for each row execute function immutable_avax_reward_terms();
create table sponsored_operations (
    id bigserial primary key,
    github_id bigint not null references managed_wallet_keys(github_id),
    bounty_id bigint not null references escrow_reward_terms(bounty_id),
    kind text not null check (kind in ('fund','settle','refund')),
    userop_hash text not null unique,
    operation jsonb not null,
    status text not null check (status in ('signed','submitted','confirmed','failed','verified')),
    tx_hash text,
    created_at timestamptz not null default now()
);
create unique index sponsored_one_pending_per_wallet on sponsored_operations(github_id)
    where status in ('signed','submitted','confirmed');
