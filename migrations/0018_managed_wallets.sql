-- App-managed signing wallets. Depends on 0017 and immutable wallets from 0015.
-- Owner authorized custody on October 17, 2026. Never replace an external wallet.
create table managed_wallet_keys (
    github_id bigint primary key references wallets(github_id),
    owner_address text not null unique references wallets(address),
    encrypted_key text not null,
    created_at timestamptz not null default now(),
    check (owner_address ~ '^0x[0-9a-f]{40}$')
);
create trigger managed_wallet_keys_immutable before update or delete on managed_wallet_keys
    for each row execute function immutable_avax_reward_terms();
