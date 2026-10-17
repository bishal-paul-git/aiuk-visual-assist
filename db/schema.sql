-- Visual Assist server edition: Postgres schema (Supabase or any Postgres 13+).
--
-- The server applies this on every boot (lib/server/store/pg/schema.ts holds
-- the same text; tests/postgres-store.test.ts checks they match). Every
-- statement is idempotent, so running it again changes nothing.
--
-- The tables live in their own schema, not "public", so Supabase's Data API
-- (PostgREST) does not expose them. Row level security is on with no
-- policies, and the API roles have no privileges: only the database owner,
-- which the server connects as, can read or write.

create schema if not exists visual_assist;

-- One row per session. "state" is the full SessionState; the other columns
-- are copies for indexing and operations queries. Writes are upserts that
-- only apply when the incoming "seq" is not older than the stored one.
create table if not exists visual_assist.sessions (
  id          text primary key,
  tenant_id   text not null,
  seq         bigint not null,
  status      text not null,
  workflow_id text not null,
  live        boolean not null default false,
  token       text not null unique,
  state       jsonb not null,
  created_at  timestamptz not null,
  updated_at  timestamptz not null default now()
);
create index if not exists sessions_tenant_created_idx on visual_assist.sessions (tenant_id, created_at desc);

-- Selected-evidence frames. Deleting a session deletes its frames.
create table if not exists visual_assist.frames (
  id          text primary key,
  session_id  text not null references visual_assist.sessions (id) on delete cascade,
  mime        text not null,
  data        bytea not null,
  created_at  timestamptz not null
);
create index if not exists frames_session_idx on visual_assist.frames (session_id);

-- Workflow and policy versions, their config audit, and integration
-- connectors (no secrets): a single JSON document.
create table if not exists visual_assist.config (
  id          smallint primary key default 1 check (id = 1),
  body        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- QA review records, evaluation runs and reviewed cases: a single JSON document.
create table if not exists visual_assist.qa (
  id          smallint primary key default 1 check (id = 1),
  body        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table visual_assist.sessions enable row level security;
alter table visual_assist.frames enable row level security;
alter table visual_assist.config enable row level security;
alter table visual_assist.qa enable row level security;

-- Supabase API roles get nothing. Skipped on a plain Postgres without them.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema visual_assist from %I', r);
      execute format('revoke all on all tables in schema visual_assist from %I', r);
      execute format('alter default privileges in schema visual_assist revoke all on tables from %I', r);
    end if;
  end loop;
end
$$;
