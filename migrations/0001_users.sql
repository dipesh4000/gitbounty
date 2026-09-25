-- 0001_users.sql
-- Nishika's GitHub-login schema, brought across from origin/main.
-- GitHub access tokens are encrypted before storage and never returned by the API.

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

create unique index if not exists users_github_login_lower_idx
    on users (lower(github_login));
