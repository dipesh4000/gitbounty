-- 0001_users.sql
-- Creates: users — one row per person who has signed in with GitHub.
-- Depends on: nothing. This is the first migration in the project.
--
-- Note on github_access_token: the backend stores this ENCRYPTED, never in plain
-- text (see backend/app/crypto.py). Nothing in this column should ever be usable
-- if the database is dumped. It is also never sent to the frontend.

create table if not exists users (
    id                  bigserial primary key,
    github_id           bigint      not null unique,
    github_login        text        not null,
    name                text,
    avatar_url          text,
    github_access_token text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    last_login_at       timestamptz
);

-- Lookups by handle are case-insensitive; GitHub logins are not case-sensitive.
create unique index if not exists users_github_login_lower_idx
    on users (lower(github_login));
