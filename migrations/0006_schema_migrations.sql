-- 0006_schema_migrations.sql
-- Creates: schema_migrations — the record of which migration files have been applied.
-- Depends on: nothing. Safe to apply at any point, including before 0001 on a fresh database.
--
-- Until now there was no way to answer "which migrations has this database had?"
-- except asking the person who ran them. The Supabase project is applied to by
-- hand (see README.md), so that question came up every time.
--
-- The runner (backend/dev/migrate.py) creates this table if it is missing,
-- applies every file in numeric order inside a transaction, and records each
-- one here with the sha256 of its contents. Recording the checksum means an
-- edit to an already-applied migration is detected rather than silently
-- ignored, which is rules.md section 4's rule enforced instead of remembered.

create table if not exists schema_migrations (
    filename    text        primary key,
    checksum    text        not null,
    applied_at  timestamptz not null default now()
);
