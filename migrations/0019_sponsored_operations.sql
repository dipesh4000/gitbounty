-- Sponsored operations and durable SmoothSend execution. Depends on 0018.
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
    status text not null check (status in ('pending','submitted','verified','failed')),
    call_target text not null,
    call_data text not null,
    op_hash text unique,
    tx_hash text unique,
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
