-- A managed signer may coexist with an immutable historical receiving wallet.
-- Never rewrite wallets.address or an existing escrow recipient binding.
alter table managed_wallet_keys drop constraint managed_wallet_keys_owner_address_fkey;
