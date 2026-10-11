-- Freeze the network on each promise; existing promises stay native AVAX mainnet.
-- Depends on 0015_avax_reward_promises.sql. No promises or points are rewritten.
alter table avax_reward_terms add column if not exists chain_id integer not null default 43114
    check (chain_id in (43114, 43113));
-- amount_wei retains its legacy name; on Fuji it holds USDC's 6-decimal base units.
-- Immutable terms supply the network for all claims and payment verification.
alter table avax_payments drop constraint if exists avax_payments_chain_id_check;
alter table avax_payments add constraint avax_payments_chain_id_check check (chain_id in (43114, 43113));

-- Preserve legacy EOA payments; all new execution uses SmoothSend smart accounts.
alter table avax_payments add column if not exists provider text not null default 'direct';
alter table avax_payments add column if not exists smart_sender text;
alter table avax_payments add column if not exists entry_point text;
alter table avax_payments add column if not exists account_factory text;
alter table avax_payments add column if not exists paymaster_address text;
alter table avax_payments add column if not exists fee_limit numeric(78,0);
alter table avax_payments add column if not exists call_data text;
alter table avax_payments add column if not exists userop_hash text;
alter table avax_payments add column if not exists operation jsonb;
create unique index if not exists avax_payments_userop_hash_unique on avax_payments(userop_hash);
-- A bundler transaction can contain several distinct UserOperations.
alter table avax_payments drop constraint if exists avax_payments_tx_hash_key;
create unique index if not exists avax_payments_legacy_tx_unique on avax_payments(tx_hash) where provider = 'direct';
create table if not exists smoothsend_payment_receipts (
    userop_hash text primary key check (userop_hash ~ '^0x[0-9a-f]{64}$'),
    tx_hash text not null,
    claim_id bigint not null references avax_reward_claims(allocation_id),
    chain_id integer not null check (chain_id in (43113, 43114)),
    nonce bigint not null,
    status text not null check (status in ('paid', 'failed')),
    verified_at timestamptz not null default now()
);
create or replace trigger smoothsend_receipts_immutable before update or delete on smoothsend_payment_receipts
    for each row execute function immutable_avax_reward_terms();
